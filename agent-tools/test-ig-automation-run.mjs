import 'dotenv/config'

const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const USER = '9ebbc422-758f-4556-9b6b-ddf4985615e2'

async function main() {
  const { getTaskFunction } = await import('../src/services/automationTasks.ts')
  const fn = getTaskFunction('instagram:performance-report')
  const result = await fn({}, {
    brandAutomationId: 'test',
    runId: 'test-run',
    brandId: BRAND,
    userId: USER,
    catalogSlug: 'weekly-performance-report',
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)