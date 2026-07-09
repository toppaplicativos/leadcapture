import 'dotenv/config'

const BRAND = process.env.IG_TEST_BRAND || 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'

async function main() {
  const { instagramService } = await import('../src/services/instagram.ts')
  const result = await instagramService.getConversations(BRAND)
  console.log('meta:', result.meta)
  console.log('threads:', result.conversations.length)
  for (const t of result.conversations.slice(0, 3)) {
    console.log('-', t.id, t.username || t.sender_id, t.message_count, t.source, (t.last_message || '').slice(0, 40))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})