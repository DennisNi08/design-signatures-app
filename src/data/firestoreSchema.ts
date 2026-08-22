export interface ProjectMember {
  projectId: string;
  uid: string;
  role: "owner" | "editor" | "viewer";
  status: "active" | "pending"
  joinedAt: Date;
}