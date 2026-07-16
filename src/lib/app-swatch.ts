export const APP_SWATCHES: { bg: string; fg: string }[] = [
  { bg: "#C1B8FA", fg: "#0D0D0D" },
  { bg: "#F6F2AD", fg: "#0D0D0D" },
  { bg: "#C6F4A3", fg: "#0D0D0D" },
  { bg: "#F7D4FA", fg: "#0D0D0D" },
  { bg: "#63C87D", fg: "#0D0D0D" },
  { bg: "#E54F83", fg: "#FCF7F0" },
  { bg: "#E8DDC8", fg: "#0D0D0D" },
  { bg: "#0D0D0D", fg: "#FCF7F0" },
];

export function getAppSwatch(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return APP_SWATCHES[h % APP_SWATCHES.length];
}
