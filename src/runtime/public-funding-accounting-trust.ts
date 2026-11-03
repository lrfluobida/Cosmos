import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fundingFields, fundingTime } from './public-validation-funding-validation.ts';
import { safePath, id } from '../artifacts/paths.ts';

export const trustFile =
  process.platform === 'win32'
    ? 'C:/ProgramData/Cosmos/AccountingTrust/trust-v1.json'
    : '/etc/cosmos/accounting-trust/trust-v1.json';
export function requireFact(value: unknown, why: string): asserts value {
  if (!value) throw new Error('Public accounting: ' + why);
}
// No environment, caller-supplied key or case-file override. Operators provision this domain out of band.
export async function machineTrust(sharedRunId: string, sharedLedgerId: string) {
  const file = resolve(trustFile);
  await safePath(dirname(file));
  const stat = await fs.lstat(file);
  requireFact(stat.isFile() && stat.nlink === 1 && stat.size < 65536, 'unsafe trust configuration');
  if (process.platform === 'win32') {
    // Read native ACLs. Rights on a containing directory can replace an otherwise read-only trust file.
    const script = [
      "$ErrorActionPreference='Stop'",
      "$trusted=@('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')",
      '$who=[Security.Principal.WindowsIdentity]::GetCurrent()',
      'if (([Security.Principal.WindowsPrincipal]::new($who)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $trusted -contains $who.User.Value) {exit 3}',
      "$p='C:/ProgramData/Cosmos/AccountingTrust/trust-v1.json'",
      "while ($p) { $item=Microsoft.PowerShell.Management\\Get-Item -Force -LiteralPath $p; $acl=Microsoft.PowerShell.Security\\Get-Acl -LiteralPath $p; if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $trusted -notcontains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value){exit 4}; $sd=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0); if($null -eq $sd.DiscretionaryAcl){exit 6}; $rights=0x500D0150; if(-not $item.PSIsContainer){$rights=$rights -bor 6}; foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and ($rule.FileSystemRights.value__ -band $rights) -and $trusted -notcontains $rule.IdentityReference.Value){exit 5}}; $p=[IO.Path]::GetDirectoryName($item.FullName) }",
      "Write-Output 'trusted-accounting-acl/1'",
    ].join('; ');
    const output = await new Promise<string>((accept, reject) =>
      execFile(
        'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, timeout: 10000, maxBuffer: 4096, env: { SystemRoot: 'C:/Windows', PSModulePath: 'C:/Windows/System32/WindowsPowerShell/v1.0/Modules' } },
        (err, stdout) => (err ? reject(err) : accept(stdout))
      )
    );
    requireFact(output.trim() === 'trusted-accounting-acl/1', 'unproved machine ACL');
  } else {
    requireFact(
      typeof process.getuid === 'function' && process.getuid() !== 0,
      'privileged process cannot attest independent deployment'
    );
    for (let p = file; ; p = dirname(p)) {
      const st = await fs.lstat(p);
      requireFact(st.uid === 0 && (st.mode & 0o022) === 0 && !st.isSymbolicLink(), 'writable machine trust ancestry');
      if (dirname(p) === p) break;
    }
  }
  const t = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(file)));
  fundingFields(t, [
    'formatVersion',
    'sharedRunId',
    'sharedLedgerId',
    'principals',
    'revoked',
    'disputed',
    'statements',
  ]);
  requireFact(
    t.formatVersion === 'public-funding-accounting-trust/1' &&
      t.sharedRunId === sharedRunId &&
      t.sharedLedgerId === sharedLedgerId &&
      [t.principals, t.revoked, t.disputed, t.statements].every((a) => Array.isArray(a) && a.length <= 256),
    'untrusted budget scope'
  );
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const p of t.principals) {
    fundingFields(p, ['id', 'publicKey', 'roles']);
    id(p.id);
    const key = createPublicKey({ key: Buffer.from(p.publicKey, 'base64'), format: 'der', type: 'spki' });
    requireFact(
      key.asymmetricKeyType === 'ed25519' &&
        key.export({ format: 'der', type: 'spki' }).toString('base64') === p.publicKey &&
        !ids.has(p.id) &&
        !keys.has(p.publicKey) &&
        Array.isArray(p.roles) &&
        p.roles.every((r: unknown) => ['operator', 'reviewer', 'owner-witness'].includes(String(r))),
      'invalid or duplicate signing identity'
    );
    ids.add(p.id);
    keys.add(p.publicKey);
  }
  for (const h of [...t.revoked, ...t.disputed])
    requireFact(typeof h === 'string' && /^[a-f0-9]{64}$/.test(h), 'invalid machine hold');
  for (const s of t.statements) {
    fundingFields(s, ['evidenceSha256', 'availableAt']);
    fundingTime(s.availableAt);
    requireFact(/^[a-f0-9]{64}$/.test(s.evidenceSha256), 'invalid statement notice');
  }
  return t;
}
export function approvalBytes(
  purpose: string,
  principal: string,
  e: any,
  sharedRunId: string,
  sharedLedgerId: string,
  evidenceSha256: string,
  approvedAt: string,
  expiresAt: string,
  sourceSha256: string
) {
  return Buffer.from(
    JSON.stringify([
      'public-funding-accounting-approval/1',
      purpose,
      principal,
      sharedRunId,
      sharedLedgerId,
      e.fundingId,
      e.requestId,
      evidenceSha256,
      approvedAt,
      expiresAt,
      sourceSha256,
    ]),
    'utf8'
  );
}
export function checkApprovals(
  trust: Awaited<ReturnType<typeof machineTrust>>,
  e: any,
  hash: string,
  approvals: any[],
  at: number
) {
  requireFact(approvals.length === 3, 'three authenticated approvals required');
  const roles = ['operator', 'reviewer', 'owner-witness'];
  approvals.forEach((a, i) => {
    fundingFields(a, ['purpose', 'principal', 'approvedAt', 'expiresAt', 'sourceSha256', 'signature']);
    fundingTime(a.approvedAt);
    fundingTime(a.expiresAt);
    const key = trust.principals.find((p: any) => p.id === a.principal && p.roles.includes(roles[i]));
    requireFact(
      key &&
        a.purpose === roles[i] &&
        a.sourceSha256 === [e.operatorFactsSha256, e.reviewerFactsSha256, e.ownerDecisionSha256][i] &&
        Date.parse(a.approvedAt) >= Math.max(Date.parse(e.targetExport.cutoffAt), Date.parse(e.allExport.cutoffAt)) &&
        Date.parse(a.approvedAt) <= at &&
        at < Date.parse(a.expiresAt) &&
        typeof a.signature === 'string' &&
        verify(
          null,
          approvalBytes(
            a.purpose,
            a.principal,
            e,
            trust.sharedRunId,
            trust.sharedLedgerId,
            hash,
            a.approvedAt,
            a.expiresAt,
            a.sourceSha256
          ),
          createPublicKey({ key: Buffer.from(key.publicKey, 'base64'), format: 'der', type: 'spki' }),
          Buffer.from(a.signature, 'base64')
        ),
      'invalid or expired ' + roles[i] + ' approval'
    );
  });
  requireFact(
    approvals[0].principal !== approvals[1].principal &&
      approvals[2].principal !== approvals[1].principal &&
      trust.principals.some((p: any) => p.id === e.followupOperator && p.roles.includes('operator')) &&
      trust.principals.some((p: any) => p.id === e.followupReviewer && p.roles.includes('reviewer')) &&
      e.followupOperator !== e.followupReviewer,
    'independent follow-up owners required'
  );
}
export function ensureNotFrozen(
  trust: Awaited<ReturnType<typeof machineTrust>>,
  hash: string,
  due: string,
  at: number
) {
  requireFact(
    !trust.revoked.includes(hash) && !trust.disputed.includes(hash),
    'authorization revoked or corrected statement disputed; notify budget owner'
  );
  let deadline = Date.parse(due);
  for (const s of trust.statements.filter((s: any) => s.evidenceSha256 === hash)) {
    const date = new Date(Date.parse(s.availableAt) + 8 * 3600000);
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while ([0, 6].includes(date.getUTCDay()));
    deadline = Math.min(deadline, date.getTime() - 8 * 3600000);
  }
  requireFact(
    Number.isFinite(deadline) && at < deadline,
    'statement review overdue; related paid work is frozen pending separate authorized review'
  );
}
