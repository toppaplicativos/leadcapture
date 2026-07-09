import 'dotenv/config'

const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'

async function main() {
  const { instagramService } = await import('../src/services/instagram.ts')
  const dashboard = await instagramService.fetchDashboard(BRAND)
  console.log(JSON.stringify(dashboard, null, 2))
}

main().catch(console.error)