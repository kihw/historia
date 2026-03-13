export interface DiplomaticMessage {
  id: string;
  turn: number;
  from: string;      // nationId
  to: string;        // nationId
  content: string;
  timestamp: number;
}

export interface DiplomaticConversation {
  nationA: string;
  nationB: string;
  messages: DiplomaticMessage[];
}
