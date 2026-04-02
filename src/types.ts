import { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
}

export interface Memory {
  id?: string;
  userId: string;
  type: "preference" | "place" | "order" | "general";
  content: string;
  category?: string;
  source?: string;
  timestamp: Timestamp;
}

export interface ChatMessage {
  id?: string;
  userId: string;
  role: "user" | "model";
  text: string;
  timestamp: Timestamp;
  hasImage?: boolean;
  imagePreview?: string;
}
