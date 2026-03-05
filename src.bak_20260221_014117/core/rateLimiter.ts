export class RateLimiter {
  private timestamps: Map<string, number[]> = new Map();
  private maxPerMinute: number;
  private maxPerDay: number;
  private dailyCounts: Map<string, { count: number; date: string }> = new Map();

  constructor(maxPerMinute: number = 3, maxPerDay: number = 200) {
    this.maxPerMinute = maxPerMinute;
    this.maxPerDay = maxPerDay;
  }

  canSend(instanceId: string): boolean {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Check daily limit
    const daily = this.dailyCounts.get(instanceId);
    if (daily && daily.date === today && daily.count >= this.maxPerDay) {
      return false;
    }

    // Check per-minute limit
    const times = this.timestamps.get(instanceId) || [];
    const recentTimes = times.filter((t) => now - t < 60000);
    if (recentTimes.length >= this.maxPerMinute) {
      return false;
    }

    return true;
  }

  recordSend(instanceId: string): void {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Update per-minute
    const times = this.timestamps.get(instanceId) || [];
    times.push(now);
    this.timestamps.set(
      instanceId,
      times.filter((t) => now - t < 60000)
    );

    // Update daily
    const daily = this.dailyCounts.get(instanceId);
    if (daily && daily.date === today) {
      daily.count++;
    } else {
      this.dailyCounts.set(instanceId, { count: 1, date: today });
    }
  }

  getStatus(instanceId: string): {
    minuteCount: number;
    dailyCount: number;
    canSend: boolean;
  } {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const times = this.timestamps.get(instanceId) || [];
    const recentTimes = times.filter((t) => now - t < 60000);
    const daily = this.dailyCounts.get(instanceId);
    const dailyCount =
      daily && daily.date === today ? daily.count : 0;

    return {
      minuteCount: recentTimes.length,
      dailyCount,
      canSend: this.canSend(instanceId),
    };
  }
}
