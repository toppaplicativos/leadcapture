import 'dotenv/config'
import pg from 'pg'

const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows } = await pool.query(
    `SELECT brand_id, username, followers_count, follows_count, media_count, ig_user_id, is_active, access_token
     FROM instagram_connections WHERE brand_id = $1 LIMIT 1`,
    [BRAND],
  )
  console.log('connection:', JSON.stringify({ ...rows[0], access_token: rows[0]?.access_token ? '***' : null }, null, 2))
  const token = rows[0]?.access_token
  if (!token) {
    console.log('No token found')
    return
  }

  const tests = [
    ['OLD days_28 deprecated metrics', `https://graph.instagram.com/v21.0/me/insights?metric=impressions,reach,profile_views,accounts_engaged&period=days_28&access_token=${encodeURIComponent(token)}`],
    ['NEW day total_value', `https://graph.instagram.com/v21.0/me/insights?metric=reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares&period=day&metric_type=total_value&access_token=${encodeURIComponent(token)}`],
    ['NEW week total_value', `https://graph.instagram.com/v21.0/me/insights?metric=reach,views,accounts_engaged,total_interactions&period=week&metric_type=total_value&access_token=${encodeURIComponent(token)}`],
    ['NEW days_28 total_value', `https://graph.instagram.com/v21.0/me/insights?metric=reach,views,accounts_engaged,total_interactions&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(token)}`],
  ]

  for (const [label, url] of tests) {
    const res = await fetch(url)
    const text = await res.text()
    console.log(`\n=== ${label} (${res.status}) ===`)
    console.log(text.slice(0, 1500))
  }

  const since = Math.floor(Date.now() / 1000) - 7 * 86400
  const until = Math.floor(Date.now() / 1000)
  const rangeUrl = `https://graph.instagram.com/v21.0/me/insights?metric=reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares,profile_views&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`
  const rangeRes = await fetch(rangeUrl)
  console.log(`\n=== 7d range (${rangeRes.status}) ===`)
  console.log((await rangeRes.text()).slice(0, 2000))

  const mediaRes = await fetch(`https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,like_count,comments_count,timestamp&limit=5&access_token=${encodeURIComponent(token)}`)
  console.log(`\n=== MEDIA (${mediaRes.status}) ===`)
  console.log((await mediaRes.text()).slice(0, 1500))

  const prof = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username,name,followers_count,follows_count,media_count&access_token=${encodeURIComponent(token)}`)
  console.log('\n=== PROFILE ===', prof.status, await prof.text())
}

main().catch((e) => console.error(e)).finally(() => pool.end())