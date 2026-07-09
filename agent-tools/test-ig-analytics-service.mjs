import 'dotenv/config'

const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'

async function main() {
  const { instagramService } = await import('../src/services/instagram.ts')
  const analytics = await instagramService.fetchAnalytics(BRAND, 7)
  console.log(JSON.stringify(analytics, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})