export interface OptionItem {
  label: string;
  value: string;
  version?: string;
}

export const modelOptions: OptionItem[] = [
  { label: "图生图4.6", value: "jimeng_seedream46_cvtob", version: "1" },
  { label: "图生图4.0", value: "jimeng_t2i_v40", version: "1" },
  { label: "文生图3.0", value: "jimeng_3.0", version: "1" },
  { label: "文生图3.1", value: "jimeng_3.1", version: "1" },
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
  { label: "4K", value: "4K", version: "1" },
];
