import{ doc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { getUid } from "./authState.svelte";
import {auth} from "./firebase";

//structures for ProjectInvite
export interface ProjectInvite {
  id: string;
  projectId: string;
  email: string;
  role: "editor" | "viewer";
  invitedByUid: string;
  status: "pending" | "accepted" | "declined";
}

//Generates the unique ID for an invite based on the project ID and the email of the invitee. This ensures that each invite is unique and can be easily retrieved or managed in the database.
function inviteId(projectId: string, email: string) {
  return `${projectId}_${email.toLowerCase()}`;
}

//Creates an invite for the project
export async function createInvite(projectId: string, email: string, role: "editor" | "viewer") {
  const uid = getUid();
  if (!uid) throw new Error("User not authenticated");

  await setDoc(doc(db, "projectInvites", inviteId(projectId, email)), {
    projectId,
    email,
    role,
    invitedByUid: uid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

//obtains all invites that a user has sent for a specific project
export async function getSentInvites(projectId: string): Promise<ProjectInvite[]> {
  const snap = await getDocs(
    query(
      collection(db, "projectInvites"),
      where("projectId", "==", projectId),
      where("status", "==", "pending")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectInvite));
}

//Generates a list of pending invites for the currently authenticated user. It queries the "projectInvites" collection in Firestore, filtering by the user's email and the "pending" status. The function returns an array of ProjectInvite objects representing the pending invites.
export async function getMyPendingInvites(): Promise<ProjectInvite[]> {
  const email = auth.currentUser?.email;
  if (!email) return [];

  const snap = await getDocs(
    query(
      collection(db, "projectInvites"),
      where("email", "==", email.toLowerCase()),
      where("status", "==", "pending")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectInvite));
}

//Accepts an invite for the currently authenticated user. It adds the user as a member of the project in the "projectMembers" collection and updates the status of the invite to "accepted" in the "projectInvites" collection.
export async function acceptInvite(invite: ProjectInvite) {
  const uid = getUid();
  if (!uid) throw new Error("Not signed in");

  await setDoc(doc(db,"projectMembers", `${uid}_${invite.projectId}`), {
    projectId: invite.projectId,
    uid,
    role: invite.role,
    status: "active",
    joinedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "projectInvites", invite.id), {
    status: "accepted",
  });
}

//Declines an invite for the currently authenticated user. It updates the status of the invite to "declined" in the "projectInvites" collection.
export async function declineInvite(invite: ProjectInvite) {
  await updateDoc(doc(db, "projectInvites", invite.id), {
    status: "declined",
  });
}

//Revokes an invite for a project. It deletes the invite document from the "projectInvites" collection in Firestore, effectively removing the invite and preventing the invited user from accepting it.
export async function revokeInvite(invite: ProjectInvite) {
  await deleteDoc(doc(db, "projectInvites", invite.id));
}

