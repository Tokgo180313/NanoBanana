export interface OptionItem {
  label: string;
  value: string;
  version?: string;
}

export const modelOptions: OptionItem[] = [
  // { label: "图生图4.6", value: "jimeng_seedream46_cvtob", version: "1" },
  // { label: "图生图4.0", value: "jimeng_t2i_v40", version: "1" },
  // { label: "文生图3.0", value: "jimeng_3.0", version: "1" },
  // { label: "文生图3.1", value: "jimeng_3.1", version: "1" },
  { label: "Doubao-Seedream-4.5", value: "doubao-seedream-4-5-251128", version: "1" },
  { label: "Doubao-Seedream-5.0", value: "doubao-seedream-5-0-260128", version: "1" },
];

export const ratioOptions: OptionItem[] = [
  { label: "1:1", value: "1:1", version: "1" },
  { label: "21:9", value: "21:9", version: "1" },
  { label: "16:9", value: "16:9", version: "1" },
  { label: "9:16", value: "9:16", version: "1" },
  { label: "4:3", value: "4:3", version: "1" },
  { label: "3:4", value: "3:4", version: "1" },
  { label: "3:2", value: "3:2", version: "1" },
  { label: "2:3", value: "2:3", version: "1" },
];

export const sizeOptions: OptionItem[] = [
  { label: "2K", value: "2K", version: "1" },
  { label: "3K", value: "3K", version: "1" },
  // { label: "4K", value: "4K", version: "1" },
];
export const recommendedSizeMap: Record<string, Record<string, string>> = {
  "2K": {
    "1:1": "2048x2048",
    "21:9": "2560x1296",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
  },
  "3K": {
    "1:1": "3072x3072",
    "21:9": "3840x1728",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "4:3": "3072x2304",
    "3:4": "2304x3072",
    "3:2": "3072x2048",
    "2:3": "2048x3072",
  },
  "4k": {
    "21:9": "6198x2656",
    "16:9": "5404x3040",
    "9:16": "3040x5404",
    "4:3": "4694x3520",
    "3:4": "3520x4694",
    "1:1": "4096x4096",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
  },
};
