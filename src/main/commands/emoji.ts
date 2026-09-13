import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface EmojiEntry {
  emoji: string
  name: string
  shortcode: string
  category: string
  keywords: string[]
}

const EMOJIS: EmojiEntry[] = [
  // Tech, Dev, Git & Work
  { emoji: '🚀', name: 'Rocket', shortcode: ':rocket:', category: 'Dev / Release', keywords: ['launch', 'deploy', 'fast', 'ship', 'production', 'start', 'boost'] },
  { emoji: '🔥', name: 'Fire', shortcode: ':fire:', category: 'Status / Hot', keywords: ['flame', 'lit', 'urgent', 'hotfix', 'trending', 'burn'] },
  { emoji: '🐛', name: 'Bug', shortcode: ':bug:', category: 'Dev / Debug', keywords: ['defect', 'issue', 'glitch', 'error', 'troubleshoot', 'fix'] },
  { emoji: '🪲', name: 'Beetle', shortcode: ':beetle:', category: 'Dev / Debug', keywords: ['insect', 'bug', 'malware'] },
  { emoji: '✨', name: 'Sparkles', shortcode: ':sparkles:', category: 'Dev / Feature', keywords: ['feature', 'new', 'shiny', 'magic', 'clean', 'polish', 'star'] },
  { emoji: '⚡', name: 'High Voltage', shortcode: ':zap:', category: 'Dev / Performance', keywords: ['fast', 'speed', 'lightning', 'energy', 'quick', 'power'] },
  { emoji: '🔒', name: 'Locked', shortcode: ':lock:', category: 'Security', keywords: ['secure', 'private', 'auth', 'protection', 'password', 'encryption', 'ssl'] },
  { emoji: '🔓', name: 'Unlocked', shortcode: ':unlock:', category: 'Security', keywords: ['open', 'public', 'unsecure', 'access'] },
  { emoji: '🛡️', name: 'Shield', shortcode: ':shield:', category: 'Security', keywords: ['defense', 'protect', 'firewall', 'security', 'guard'] },
  { emoji: '🔑', name: 'Key', shortcode: ':key:', category: 'Security', keywords: ['secret', 'token', 'apikey', 'access', 'password', 'credential'] },
  { emoji: '📦', name: 'Package', shortcode: ':package:', category: 'Dev / Build', keywords: ['bundle', 'npm', 'module', 'box', 'delivery', 'artifact', 'release'] },
  { emoji: '🛠️', name: 'Hammer and Wrench', shortcode: ':hammer_and_wrench:', category: 'Dev / Tools', keywords: ['maintenance', 'refactor', 'build', 'settings', 'fix', 'config'] },
  { emoji: '⚙️', name: 'Gear', shortcode: ':gear:', category: 'Dev / Config', keywords: ['settings', 'preferences', 'system', 'engine', 'options', 'automation'] },
  { emoji: '🧪', name: 'Test Tube', shortcode: ':test_tube:', category: 'Dev / QA', keywords: ['experiment', 'test', 'spec', 'unit', 'ci', 'laboratory'] },
  { emoji: '📝', name: 'Memo', shortcode: ':memo:', category: 'Dev / Docs', keywords: ['notes', 'documentation', 'readme', 'write', 'changelog', 'paper'] },
  { emoji: '📚', name: 'Books', shortcode: ':books:', category: 'Dev / Docs', keywords: ['library', 'docs', 'manual', 'learn', 'knowledge'] },
  { emoji: '💡', name: 'Light Bulb', shortcode: ':bulb:', category: 'Ideas', keywords: ['idea', 'tip', 'insight', 'smart', 'invention', 'bright'] },
  { emoji: '🎯', name: 'Direct Hit', shortcode: ':dart:', category: 'Goals', keywords: ['target', 'goal', 'objective', 'milestone', 'accurate', 'bullseye'] },
  { emoji: '🚧', name: 'Construction', shortcode: ':construction:', category: 'Status / WIP', keywords: ['wip', 'building', 'barrier', 'under construction', 'progress'] },
  { emoji: '🚨', name: 'Police Car Light', shortcode: ':rotating_light:', category: 'Alerts', keywords: ['alarm', 'incident', 'emergency', 'outage', 'siren', 'critical', 'alert'] },
  { emoji: '⚠️', name: 'Warning', shortcode: ':warning:', category: 'Alerts', keywords: ['caution', 'danger', 'alert', 'notice', 'risk'] },
  { emoji: '🛑', name: 'Stop Sign', shortcode: ':octagonal_sign:', category: 'Alerts', keywords: ['halt', 'block', 'breaker', 'breaking', 'error', 'stop'] },
  { emoji: '♻️', name: 'Recycle', shortcode: ':recycle:', category: 'Dev / Refactor', keywords: ['refactor', 'cleanup', 'reuse', 'green'] },
  { emoji: '🏷️', name: 'Label', shortcode: ':label:', category: 'Dev / Tag', keywords: ['tag', 'version', 'release', 'badge'] },
  { emoji: '💬', name: 'Speech Balloon', shortcode: ':speech_balloon:', category: 'Communication', keywords: ['chat', 'comment', 'message', 'discussion', 'feedback'] },
  { emoji: '🔍', name: 'Magnifying Glass', shortcode: ':mag:', category: 'Dev / Search', keywords: ['find', 'search', 'inspect', 'query', 'audit', 'explore'] },
  { emoji: '🔗', name: 'Link', shortcode: ':link:', category: 'Dev / Network', keywords: ['url', 'href', 'chain', 'hyperlink', 'connect'] },
  { emoji: '🌐', name: 'Globe with Meridians', shortcode: ':globe_with_meridians:', category: 'Dev / Network', keywords: ['web', 'internet', 'network', 'i18n', 'world', 'domain'] },
  { emoji: '💻', name: 'Laptop', shortcode: ':computer:', category: 'Devices', keywords: ['pc', 'machine', 'client', 'screen', 'device'] },
  { emoji: '🖥️', name: 'Desktop Computer', shortcode: ':desktop_computer:', category: 'Devices', keywords: ['monitor', 'workstation', 'server', 'display'] },
  { emoji: '📱', name: 'Mobile Phone', shortcode: ':iphone:', category: 'Devices', keywords: ['phone', 'ios', 'android', 'smartphone', 'mobile', 'responsive'] },
  { emoji: '💾', name: 'Floppy Disk', shortcode: ':floppy_disk:', category: 'Dev / Storage', keywords: ['save', 'disk', 'backup', 'storage'] },
  { emoji: '🤖', name: 'Robot', shortcode: ':robot:', category: 'AI / Automation', keywords: ['bot', 'ai', 'agent', 'automation', 'llm', 'machine'] },

  // Status & Symbols
  { emoji: '✅', name: 'Check Mark Button', shortcode: ':white_check_mark:', category: 'Status', keywords: ['done', 'complete', 'approved', 'pass', 'success', 'ok', 'verified', 'yes'] },
  { emoji: '✔️', name: 'Check Mark', shortcode: ':heavy_check_mark:', category: 'Status', keywords: ['done', 'valid', 'correct', 'pass'] },
  { emoji: '❌', name: 'Cross Mark', shortcode: ':x:', category: 'Status', keywords: ['failed', 'rejected', 'error', 'cancel', 'no', 'delete', 'remove'] },
  { emoji: '❎', name: 'Cross Mark Button', shortcode: ':negative_squared_cross_mark:', category: 'Status', keywords: ['reject', 'disable', 'box'] },
  { emoji: '⏳', name: 'Hourglass', shortcode: ':hourglass_flowing_sand:', category: 'Status / Time', keywords: ['pending', 'waiting', 'loading', 'timer', 'progress', 'delay'] },
  { emoji: '⏱️', name: 'Stopwatch', shortcode: ':stopwatch:', category: 'Status / Time', keywords: ['time', 'benchmark', 'latency', 'duration', 'fast'] },
  { emoji: '📌', name: 'Pushpin', shortcode: ':pushpin:', category: 'Status', keywords: ['pin', 'sticky', 'important', 'notice', 'highlight'] },
  { emoji: '📍', name: 'Round Pushpin', shortcode: ':round_pushpin:', category: 'Status', keywords: ['location', 'place', 'map', 'point'] },
  { emoji: '⭐', name: 'Star', shortcode: ':star:', category: 'Status / Favorite', keywords: ['favorite', 'bookmark', 'rate', 'gold', 'score'] },
  { emoji: '🌟', name: 'Glowing Star', shortcode: ':star2:', category: 'Status', keywords: ['highlight', 'special', 'featured'] },
  { emoji: '🎉', name: 'Party Popper', shortcode: ':tada:', category: 'Celebration', keywords: ['celebrate', 'congrats', 'party', 'shipped', 'done', 'cheers'] },
  { emoji: '🏆', name: 'Trophy', shortcode: ':trophy:', category: 'Achievement', keywords: ['winner', 'first', 'award', 'gold', 'victory', 'best'] },
  { emoji: '🥇', name: '1st Place Medal', shortcode: ':first_place_medal:', category: 'Achievement', keywords: ['gold', 'winner', 'number one'] },
  { emoji: '🟢', name: 'Green Circle', shortcode: ':green_circle:', category: 'Indicators', keywords: ['online', 'active', 'healthy', 'up', 'operational'] },
  { emoji: '🟡', name: 'Yellow Circle', shortcode: ':yellow_circle:', category: 'Indicators', keywords: ['degraded', 'warning', 'idle', 'paused'] },
  { emoji: '🔴', name: 'Red Circle', shortcode: ':red_circle:', category: 'Indicators', keywords: ['offline', 'down', 'critical', 'stopped', 'error'] },
  { emoji: '🔵', name: 'Blue Circle', shortcode: ':blue_circle:', category: 'Indicators', keywords: ['info', 'primary', 'running'] },
  { emoji: '🟣', name: 'Purple Circle', shortcode: ':purple_circle:', category: 'Indicators', keywords: ['accent', 'tag'] },
  { emoji: '⚪', name: 'White Circle', shortcode: ':white_circle:', category: 'Indicators', keywords: ['neutral', 'blank'] },
  { emoji: '⚫', name: 'Black Circle', shortcode: ':black_circle:', category: 'Indicators', keywords: ['dark', 'disabled'] },

  // Gestures & People
  { emoji: '👍', name: 'Thumbs Up', shortcode: ':thumbsup:', category: 'Gestures', keywords: ['approve', 'agree', 'like', 'good', 'plus1', 'yes'] },
  { emoji: '👎', name: 'Thumbs Down', shortcode: ':thumbsdown:', category: 'Gestures', keywords: ['disapprove', 'dislike', 'bad', 'minus1', 'no'] },
  { emoji: '👋', name: 'Waving Hand', shortcode: ':wave:', category: 'Gestures', keywords: ['hello', 'bye', 'greet', 'welcome'] },
  { emoji: '🙌', name: 'Raising Hands', shortcode: ':raised_hands:', category: 'Gestures', keywords: ['praise', 'celebrate', 'hooray'] },
  { emoji: '👏', name: 'Clapping Hands', shortcode: ':clap:', category: 'Gestures', keywords: ['applause', 'bravo', 'congrats'] },
  { emoji: '🤝', name: 'Handshake', shortcode: ':handshake:', category: 'Gestures', keywords: ['deal', 'agreement', 'partner', 'welcome'] },
  { emoji: '🙏', name: 'Folded Hands', shortcode: ':pray:', category: 'Gestures', keywords: ['thanks', 'please', 'grateful', 'pray'] },
  { emoji: '💪', name: 'Flexed Biceps', shortcode: ':muscle:', category: 'Gestures', keywords: ['strong', 'power', 'effort'] },
  { emoji: '👀', name: 'Eyes', shortcode: ':eyes:', category: 'Gestures', keywords: ['look', 'see', 'review', 'reviewing', 'watch', 'peek'] },
  { emoji: '🧠', name: 'Brain', shortcode: ':brain:', category: 'Concepts', keywords: ['smart', 'think', 'intellect', 'ai', 'mind'] },

  // Smileys & Reactions
  { emoji: '😀', name: 'Grinning Face', shortcode: ':grinning:', category: 'Smileys', keywords: ['happy', 'smile', 'joy'] },
  { emoji: '😃', name: 'Smiling Face with Big Eyes', shortcode: ':smiley:', category: 'Smileys', keywords: ['happy', 'joy', 'smile'] },
  { emoji: '😄', name: 'Grinning Face with Smiling Eyes', shortcode: ':smile:', category: 'Smileys', keywords: ['happy', 'cheer'] },
  { emoji: '😊', name: 'Smiling Face with Smiling Eyes', shortcode: ':blush:', category: 'Smileys', keywords: ['proud', 'smile'] },
  { emoji: '😎', name: 'Smiling Face with Sunglasses', shortcode: ':sunglasses:', category: 'Smileys', keywords: ['cool', 'chill', 'boss'] },
  { emoji: '🤓', name: 'Nerd Face', shortcode: ':nerd_face:', category: 'Smileys', keywords: ['geek', 'nerd', 'glasses', 'study'] },
  { emoji: '🤔', name: 'Thinking Face', shortcode: ':thinking:', category: 'Smileys', keywords: ['ponder', 'consider', 'hmm', 'curious', 'wonder'] },
  { emoji: '🫡', name: 'Saluting Face', shortcode: ':saluting_face:', category: 'Smileys', keywords: ['respect', 'aye', 'roger', 'understood'] },
  { emoji: '🥳', name: 'Partying Face', shortcode: ':partying_face:', category: 'Smileys', keywords: ['celebrate', 'party', 'fun'] },
  { emoji: '😅', name: 'Grinning Face with Sweat', shortcode: ':sweat_smile:', category: 'Smileys', keywords: ['relief', 'whew', 'close call'] },
  { emoji: '😭', name: 'Loudly Crying Face', shortcode: ':sob:', category: 'Smileys', keywords: ['cry', 'sad', 'tears'] },
  { emoji: '😱', name: 'Face Screaming in Fear', shortcode: ':scream:', category: 'Smileys', keywords: ['shock', 'omg', 'disaster'] },
  { emoji: '🤯', name: 'Exploding Head', shortcode: ':exploding_head:', category: 'Smileys', keywords: ['mind blown', 'shocked', 'wow'] },
  { emoji: '☕', name: 'Hot Beverage', shortcode: ':coffee:', category: 'Food / Drink', keywords: ['coffee', 'tea', 'caffeine', 'break', 'morning'] },
  { emoji: '🍕', name: 'Pizza', shortcode: ':pizza:', category: 'Food / Drink', keywords: ['food', 'slice', 'dinner'] },
  { emoji: '🍿', name: 'Popcorn', shortcode: ':popcorn:', category: 'Food / Drink', keywords: ['drama', 'show', 'movie', 'watch'] },

  // Arrows & Navigation
  { emoji: '➡️', name: 'Right Arrow', shortcode: ':arrow_right:', category: 'Arrows', keywords: ['next', 'forward', 'proceed'] },
  { emoji: '⬅️', name: 'Left Arrow', shortcode: ':arrow_left:', category: 'Arrows', keywords: ['back', 'previous', 'return'] },
  { emoji: '⬆️', name: 'Up Arrow', shortcode: ':arrow_up:', category: 'Arrows', keywords: ['top', 'increase', 'upgrade'] },
  { emoji: '⬇️', name: 'Down Arrow', shortcode: ':arrow_down:', category: 'Arrows', keywords: ['bottom', 'decrease', 'download'] },
  { emoji: '🔄', name: 'Counterclockwise Arrows', shortcode: ':arrows_counterclockwise:', category: 'Arrows', keywords: ['reload', 'refresh', 'sync', 'loop'] }
]

const fuse = new Fuse(EMOJIS, {
  keys: ['name', 'shortcode', 'category', 'keywords'],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  const list = q ? fuse.search(q).map((r) => r.item) : EMOJIS.slice(0, 18)

  if (list.length === 0) {
    return [
      {
        label: `No emoji found for "${q}"`,
        sublabel: 'Try searching: /emoji rocket · /emoji check · /emoji lock · /emoji bug',
        value: '',
        disabled: true
      }
    ]
  }

  return list.map((item) => ({
    label: `${item.emoji}  ${item.name}`,
    sublabel: `${item.shortcode} · ${item.category} · ${item.keywords.slice(0, 3).join(', ')}`,
    value: item.emoji
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
