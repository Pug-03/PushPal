// Common git error messages → a plain-language explanation and the steps to
// fix it (texts in the i18n catalogs under gerr.<key>.title / gerr.<key>.fix).
// No `vscode` import.

export type GitErrorKey =
  | 'protectedBranch'
  | 'rejected'
  | 'auth'
  | 'repoNotFound'
  | 'noUpstream'
  | 'detached'
  | 'mergeInProgress'
  | 'rebaseInProgress'
  | 'localChanges'
  | 'untrackedOverwritten'
  | 'unrelatedHistories'
  | 'identity'
  | 'locked'
  | 'network'
  | 'diverged'
  | 'notRepo'
  | 'unknown';

/** First match wins, so the more specific patterns come first. */
const RULES: Array<[GitErrorKey, RegExp]> = [
  ['protectedBranch', /GH006|GH013|protected branch|repository rule violations|Changes must be made through a pull request|not allowed to push code to protected branches/i],
  ['rejected', /\[rejected\]|non-fast-forward|fetch first|Updates were rejected because/i],
  ['repoNotFound', /repository ['"]?.*['"]? not found|Repository not found|does not appear to be a git repository/i],
  ['auth', /Authentication failed|could not read Username|Permission denied \(publickey|terminal prompts disabled|HTTP Basic: Access denied|invalid username or password|returned error: 40[13]/i],
  ['noUpstream', /has no upstream branch|no tracking information|There is no tracking information/i],
  ['detached', /You are not currently on a branch|HEAD detached/i],
  ['mergeInProgress', /You have not concluded your merge|MERGE_HEAD exists|unmerged files|Merging is not possible because you have unmerged files|you need to resolve your current index first/i],
  ['rebaseInProgress', /rebase in progress|It seems that there is already a rebase-merge directory/i],
  ['untrackedOverwritten', /untracked working tree files would be overwritten/i],
  ['localChanges', /Your local changes to the following files would be overwritten|Please commit your changes or stash them/i],
  ['unrelatedHistories', /refusing to merge unrelated histories/i],
  ['diverged', /Need to specify how to reconcile divergent branches|divergent branches/i],
  ['identity', /Please tell me who you are|empty ident|unable to auto-detect email/i],
  ['locked', /index\.lock|Another git process seems to be running/i],
  ['network', /Could not resolve host|unable to access|Connection timed out|Network is unreachable|Connection refused|Operation timed out|Failed to connect|Could not read from remote repository/i],
  ['notRepo', /not a git repository/i],
];

export function explainGitError(output: string): GitErrorKey {
  for (const [key, re] of RULES) if (re.test(output)) return key;
  return 'unknown';
}

export const GIT_ERROR_KEYS: GitErrorKey[] = RULES.map(([k]) => k).concat('unknown');
