export function timeAt(date: Date | string, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(date))
    .replace("GMT+5:30", "IST");
}
export function dateAt(date: Date | string, zone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}
