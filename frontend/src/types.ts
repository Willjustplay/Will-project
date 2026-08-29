export type TxType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note?: string;
  date: string;
  created_at: string;
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
  created_at: string;
}

export interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  due_date?: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
  days: string[];
  created_at: string;
}

export interface VaultAccount {
  id: string;
  service: string;
  username: string;
  password: string;
  note?: string;
  created_at: string;
}

export interface FileItem {
  id: string;
  filename: string;
  storage_path: string;
  content_type: string;
  size: number;
  kind: "image" | "file";
  created_at: string;
}

export const EXPENSE_CATEGORIES = [
  { key: "Makanan", icon: "fast-food", color: "#FF9F0A" },
  { key: "Transportasi", icon: "car", color: "#0A84FF" },
  { key: "Belanja", icon: "cart", color: "#BF5AF2" },
  { key: "Tagihan", icon: "receipt", color: "#FF453A" },
  { key: "Hiburan", icon: "game-controller", color: "#32D74B" },
  { key: "Kesehatan", icon: "medkit", color: "#FF6482" },
  { key: "Lainnya", icon: "ellipsis-horizontal", color: "#A3A3A3" },
];

export const INCOME_CATEGORIES = [
  { key: "Gaji", icon: "cash", color: "#32D74B" },
  { key: "Bonus", icon: "gift", color: "#FFBF00" },
  { key: "Investasi", icon: "trending-up", color: "#0A84FF" },
  { key: "Hadiah", icon: "heart", color: "#FF6482" },
  { key: "Lainnya", icon: "ellipsis-horizontal", color: "#A3A3A3" },
];

export function categoryMeta(type: TxType, key: string) {
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find((c) => c.key === key) || list[list.length - 1];
}
