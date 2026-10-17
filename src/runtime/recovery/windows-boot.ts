import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, parse, resolve } from 'node:path';

export interface WindowsBootObservation {
  machineHash: string;
  bootAt: string;
  observedAt: string;
  kernelBoot: { provider: string; eventId: number; version: number; recordId: string; timeCreated: string; bootType: number };
  kernelGeneral: { provider: string; eventId: number; version: number; recordId: string; timeCreated: string; bootMode: number; startTime: string };
  paths: { path: string; volumeHash: string }[];
}

// Fixed read-only program. Paths travel as stdin JSON, never as PowerShell source.
const query = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$os = Get-CimInstance Win32_OperatingSystem
$product = Get-CimInstance Win32_ComputerSystemProduct
$disks = @(Get-CimInstance Win32_LogicalDisk)
function EventData($event) {
  $xml = [xml]$event.ToXml()
  $data = @{}
  foreach ($item in $xml.Event.EventData.Data) { $data[$item.Name] = [string]$item.'#text' }
  return $data
}
$boot = Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Kernel-Boot';Id=27} -MaxEvents 1
$general = Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Kernel-General';Id=12} -MaxEvents 1
$bd = EventData $boot
$gd = EventData $general
if (!$bd.ContainsKey('BootType') -or !$gd.ContainsKey('BootMode') -or !$gd.ContainsKey('StartTime')) { throw 'Missing boot event fields' }
$paths = @($request.paths | ForEach-Object {
  $path = [string]$_
  $item = Get-Item -LiteralPath $path -Force
  $canonical = (Resolve-Path -LiteralPath $path).ProviderPath
  $drive = [IO.Path]::GetPathRoot($canonical)
  $disk = @($disks | Where-Object { $_.DeviceID -eq $drive.TrimEnd('\') })
  if ($disk.Count -ne 1) { throw 'Unknown volume' }
  $reparseFree = $true
  $current = $item
  while ($null -ne $current) {
    if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $reparseFree = $false }
    $parent = [IO.Directory]::GetParent($current.FullName)
    if ($null -eq $parent) { break }
    $current = Get-Item -LiteralPath $parent.FullName -Force
  }
  @{path=$path;canonicalPath=$canonical;drive=$drive;driveType=[int]$disk[0].DriveType;volumeSerial=[string]$disk[0].VolumeSerialNumber;fileSystem=[string]$disk[0].FileSystem;reparseFree=$reparseFree}
})
@{
  formatVersion=1;machineId=[string]$product.UUID;machineName=[Environment]::MachineName
  observedAt=[DateTime]::UtcNow.ToString('o');lastBootUpTime=$os.LastBootUpTime.ToUniversalTime().ToString('o')
  kernelBoot=@{provider=$boot.ProviderName;eventId=$boot.Id;version=$boot.Version;recordId=[string]$boot.RecordId;machine=$boot.MachineName;timeCreated=$boot.TimeCreated.ToUniversalTime().ToString('o');bootType=[int]$bd.BootType}
  kernelGeneral=@{provider=$general.ProviderName;eventId=$general.Id;version=$general.Version;recordId=[string]$general.RecordId;machine=$general.MachineName;timeCreated=$general.TimeCreated.ToUniversalTime().ToString('o');bootMode=[int]$gd.BootMode;startTime=[string]$gd.StartTime}
  paths=$paths
} | ConvertTo-Json -Depth 8 -Compress
`;

function shape(value: unknown, keys: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error('Unknown Windows boot observation schema.');
}
function utc(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,7}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Windows observation requires explicit UTC.');
  const [whole, fraction] = value.slice(0, -1).split('.');
  if (new Date(value).toISOString().slice(0, 19) !== whole) throw new Error('Invalid UTC calendar time.');
  return `${whole}.${fraction.padEnd(7, '0')}Z`;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Collect trusted local facts; there is deliberately no caller-supplied boot/verifier/clock. */
export async function collectWindowsBoot(paths: string[]): Promise<WindowsBootObservation> {
  if (process.platform !== 'win32') throw new Error('Previous-boot recovery requires Windows.');
  if (!paths.length || new Set(paths).size !== paths.length || paths.some(path => !isAbsolute(path) || !/^[a-z]:[\\/]/i.test(path)
    || resolve(path) !== path || path.includes('\\\\') || /[. ](?:[\\/]|$)/.test(path))) throw new Error('Expected canonical local fixed-volume paths.');
  let raw: unknown;
  try {
    const bytes = childProcess.execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query],
      { input: JSON.stringify({ paths }), windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('Windows boot observation failed; recovery remains blocked.'); }
  shape(raw, ['formatVersion', 'machineId', 'machineName', 'observedAt', 'lastBootUpTime', 'kernelBoot', 'kernelGeneral', 'paths']);
  if (raw.formatVersion !== 1 || typeof raw.machineId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(raw.machineId)
    || /^(?:0|-)+$/.test(raw.machineId) || /^(?:f|-)+$/i.test(raw.machineId) || typeof raw.machineName !== 'string' || !raw.machineName) throw new Error('Unknown Windows machine identity.');
  const bootAt = utc(raw.lastBootUpTime), observedAt = utc(raw.observedAt);
  const b = raw.kernelBoot, g = raw.kernelGeneral;
  shape(b, ['provider', 'eventId', 'version', 'recordId', 'machine', 'timeCreated', 'bootType']);
  shape(g, ['provider', 'eventId', 'version', 'recordId', 'machine', 'timeCreated', 'bootMode', 'startTime']);
  if (b.provider !== 'Microsoft-Windows-Kernel-Boot' || b.eventId !== 27 || b.version !== 1 || b.bootType !== 0
    || g.provider !== 'Microsoft-Windows-Kernel-General' || g.eventId !== 12 || g.version !== 0 || g.bootMode !== 0
    || utc(g.startTime) !== bootAt || b.machine?.toLowerCase() !== raw.machineName.toLowerCase() || g.machine?.toLowerCase() !== raw.machineName.toLowerCase()
    || typeof b.recordId !== 'string' || !/^[1-9]\d*$/.test(b.recordId) || typeof g.recordId !== 'string' || !/^[1-9]\d*$/.test(g.recordId)) throw new Error('Current complete Windows boot is not established.');
  for (const event of [b, g]) {
    const time = utc(event.timeCreated);
    if (time < bootAt || time > observedAt || Date.parse(time) - Date.parse(bootAt) > 120_000) throw new Error('Conflicting current boot event time.');
  }
  if (bootAt > observedAt || Date.parse(observedAt) > Date.now() + 1000 || Date.now() - Date.parse(observedAt) > 30_000) throw new Error('Conflicting Windows observation clock.');
  if (!Array.isArray(raw.paths) || raw.paths.length !== paths.length) throw new Error('Missing local volume observations.');
  const machineHash = hash(`${raw.machineId.toLowerCase()}\n${raw.machineName.toLowerCase()}`);
  const volumes = raw.paths.map((p: unknown, index: number) => {
    shape(p, ['path', 'canonicalPath', 'drive', 'driveType', 'volumeSerial', 'fileSystem', 'reparseFree']);
    if (p.path !== paths[index] || p.canonicalPath !== paths[index] || p.drive !== parse(paths[index]).root || p.driveType !== 3 || p.reparseFree !== true
      || p.fileSystem !== 'NTFS' || typeof p.volumeSerial !== 'string' || !/^[a-f\d]{8}$/i.test(p.volumeSerial)) throw new Error('Path is not canonical on a known local fixed NTFS volume without reparse points.');
    return { path: p.path as string, volumeHash: hash(`${machineHash}\n${p.drive.toLowerCase()}\n${p.volumeSerial.toUpperCase()}\n${p.fileSystem}`) };
  });
  return { machineHash, bootAt, observedAt,
    kernelBoot: { provider: b.provider, eventId: b.eventId, version: b.version, recordId: b.recordId, timeCreated: utc(b.timeCreated), bootType: b.bootType },
    kernelGeneral: { provider: g.provider, eventId: g.eventId, version: g.version, recordId: g.recordId, timeCreated: utc(g.timeCreated), bootMode: g.bootMode, startTime: utc(g.startTime) }, paths: volumes };
}
