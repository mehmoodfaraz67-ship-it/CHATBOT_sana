export type MessageRole = "user" | "model";

export type ChatMode = "chat" | "image";

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  mode?: ChatMode;
  imageUrl?: string;
  imageAspectRatio?: ImageAspectRatio;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
