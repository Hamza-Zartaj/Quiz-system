type LooseTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: any[];
};

type LooseFunction = {
  Args: Record<string, any>;
  Returns: any;
};

export type LooseDatabase = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, LooseTable>;
    Functions: Record<string, LooseFunction>;
  };
};
