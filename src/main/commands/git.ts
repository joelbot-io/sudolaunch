import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface GitRecipe {
  title: string
  command: string
  category: string
  description: string
  keywords: string[]
}

const RECIPES: GitRecipe[] = [
  // Undo & Recovery
  {
    title: 'Undo last commit (keep changes staged)',
    command: 'git reset --soft HEAD~1',
    category: 'Undo & Recovery',
    description: 'Moves HEAD back 1 commit; your changes remain staged in the index',
    keywords: ['undo', 'uncommit', 'revert', 'soft', 'last commit', 'keep changes']
  },
  {
    title: 'Undo last commit (unstage changes to working tree)',
    command: 'git reset HEAD~1',
    category: 'Undo & Recovery',
    description: 'Moves HEAD back 1 commit; your changes remain unstaged in working directory',
    keywords: ['undo', 'uncommit', 'mixed', 'unstage']
  },
  {
    title: 'Discard all unstaged local changes',
    command: 'git restore .',
    category: 'Undo & Recovery',
    description: 'Discards modifications in tracked working tree files',
    keywords: ['discard', 'revert', 'clean', 'undo changes', 'reset working tree']
  },
  {
    title: 'Unstage a file from staging area',
    command: 'git restore --staged <file>',
    category: 'Undo & Recovery',
    description: 'Removes file from staging area without touching file contents',
    keywords: ['unstage', 'reset file', 'stage', 'remove from stage']
  },
  {
    title: 'Amend last commit message or files without changing message',
    command: 'git commit --amend --no-edit',
    category: 'Undo & Recovery',
    description: 'Add newly staged changes directly into the most recent commit',
    keywords: ['amend', 'add to last commit', 'fixup', 'modify commit']
  },
  {
    title: 'Change last commit message',
    command: 'git commit --amend -m "new message"',
    category: 'Undo & Recovery',
    description: 'Rewrites the commit message of the most recent commit',
    keywords: ['amend', 'message', 'rename commit', 'fix typo']
  },
  {
    title: 'View reference log (rescue lost commits / branches)',
    command: 'git reflog',
    category: 'Undo & Recovery',
    description: 'Shows chronological history of HEAD updates; recover lost commits',
    keywords: ['reflog', 'lost', 'recover', 'rescue', 'history']
  },

  // Branch Operations
  {
    title: 'Create and switch to new branch',
    command: 'git checkout -b <branch-name>',
    category: 'Branching',
    description: 'Creates a new branch from current HEAD and switches to it immediately',
    keywords: ['branch', 'new branch', 'create', 'switch', 'checkout']
  },
  {
    title: 'Rename current branch',
    command: 'git branch -m <new-name>',
    category: 'Branching',
    description: 'Renames the currently checked out local branch',
    keywords: ['rename branch', 'branch name', 'move branch']
  },
  {
    title: 'Delete local branch (safe)',
    command: 'git branch -d <branch-name>',
    category: 'Branching',
    description: 'Deletes local branch only if fully merged upstream',
    keywords: ['delete branch', 'remove branch', 'kill branch']
  },
  {
    title: 'Force delete local branch (unmerged)',
    command: 'git branch -D <branch-name>',
    category: 'Branching',
    description: 'Forcibly deletes local branch regardless of merge status',
    keywords: ['force delete', 'delete branch', 'destroy branch']
  },
  {
    title: 'Delete remote branch on origin',
    command: 'git push origin --delete <branch-name>',
    category: 'Branching',
    description: 'Deletes branch from remote repository',
    keywords: ['delete remote', 'remote branch', 'remove origin']
  },
  {
    title: 'List all branches (local and remote)',
    command: 'git branch -a -vv',
    category: 'Branching',
    description: 'Lists all local and remote tracking branches with commit hash & upstream info',
    keywords: ['list branches', 'all branches', 'tracking']
  },

  // Remote & Sync
  {
    title: 'Prune deleted remote tracking branches',
    command: 'git remote prune origin && git fetch --prune',
    category: 'Remote & Sync',
    description: 'Cleans up local references to branches deleted on the remote server',
    keywords: ['prune', 'cleanup', 'stale branches', 'sync remote', 'origin']
  },
  {
    title: 'Pull latest changes with rebase (avoid merge commits)',
    command: 'git pull --rebase origin main',
    category: 'Remote & Sync',
    description: 'Fetches upstream changes and replays local commits on top',
    keywords: ['pull', 'rebase', 'sync', 'update', 'fetch']
  },
  {
    title: 'Push new branch and set upstream tracking',
    command: 'git push -u origin HEAD',
    category: 'Remote & Sync',
    description: 'Pushes current branch to remote and sets it as default upstream tracking branch',
    keywords: ['push', 'set-upstream', 'first push', 'publish']
  },
  {
    title: 'Inspect remote URLs',
    command: 'git remote -v',
    category: 'Remote & Sync',
    description: 'Displays fetch and push URLs configured for remote repositories',
    keywords: ['remote', 'origin', 'urls', 'check remote']
  },

  // Stashing
  {
    title: 'Stash changes including untracked files with a name',
    command: 'git stash save -u "WIP description"',
    category: 'Stashing',
    description: 'Saves dirty working directory and untracked files into stash with custom message',
    keywords: ['stash', 'save', 'untracked', 'wip', 'pause']
  },
  {
    title: 'Pop most recent stash',
    command: 'git stash pop',
    category: 'Stashing',
    description: 'Restores stashed changes and removes entry from stash list',
    keywords: ['stash pop', 'restore stash', 'apply stash']
  },
  {
    title: 'List all stashes',
    command: 'git stash list',
    category: 'Stashing',
    description: 'Displays all stashed commits with timestamps and messages',
    keywords: ['stash list', 'show stashes', 'view stash']
  },

  // Rebase & Merge
  {
    title: 'Interactive rebase last N commits (squash / edit / reorder)',
    command: 'git rebase -i HEAD~3',
    category: 'Rebase & Merge',
    description: 'Opens editor to squash, reword, edit, or drop the last N commits',
    keywords: ['squash', 'rebase', 'interactive', 'cleanup commits', 'combine']
  },
  {
    title: 'Abort in-progress rebase',
    command: 'git rebase --abort',
    category: 'Rebase & Merge',
    description: 'Completely aborts rebase operation and returns to original branch state',
    keywords: ['abort rebase', 'cancel rebase', 'rebase conflict']
  },
  {
    title: 'Continue rebase after resolving conflicts',
    command: 'git rebase --continue',
    category: 'Rebase & Merge',
    description: 'Resumes rebase process after conflicts have been staged',
    keywords: ['continue rebase', 'resolved', 'next rebase']
  },
  {
    title: 'Cherry-pick commit to current branch',
    command: 'git cherry-pick <commit-hash>',
    category: 'Rebase & Merge',
    description: 'Applies the changes from a specific commit onto current branch',
    keywords: ['cherry-pick', 'port commit', 'copy commit']
  },
  {
    title: 'Squash merge a feature branch',
    command: 'git merge --squash <feature-branch>',
    category: 'Rebase & Merge',
    description: 'Combines all commits from branch into a single staged change',
    keywords: ['squash merge', 'merge squash', 'single commit']
  },

  // Inspection & Status
  {
    title: 'Visual commit graph history',
    command: 'git log --oneline --graph --decorate --all -n 25',
    category: 'Inspection',
    description: 'Clean compact one-line visual ASCII graph of commit history across all branches',
    keywords: ['log', 'graph', 'tree', 'history', 'commits']
  },
  {
    title: 'Short status with branch name',
    command: 'git status -s -b',
    category: 'Inspection',
    description: 'Compact 2-column status display with branch tracking info',
    keywords: ['status', 'clean', 'short status', 'changes']
  },
  {
    title: 'Diff summary of modified files and line counts',
    command: 'git diff --stat',
    category: 'Inspection',
    description: 'Shows insertion/deletion stats per changed file',
    keywords: ['diff', 'stat', 'summary', 'changes']
  },
  {
    title: 'Clean untracked files and directories',
    command: 'git clean -fd',
    category: 'Inspection',
    description: 'Removes untracked files and directories from working tree',
    keywords: ['clean', 'remove untracked', 'purge']
  }
]

const fuse = new Fuse(RECIPES, {
  keys: ['title', 'command', 'category', 'description', 'keywords'],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  const list = q ? fuse.search(q).map((r) => r.item) : RECIPES.slice(0, 15)

  if (list.length === 0) {
    return [
      {
        label: `No git recipe found for "${q}"`,
        sublabel: 'Try: /git undo · /git squash · /git prune · /git stash · /git branch · /git rebase',
        value: '',
        disabled: true
      }
    ]
  }

  return list.map((item) => ({
    label: item.title,
    sublabel: `${item.command} · ${item.category}`,
    value: item.command
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
