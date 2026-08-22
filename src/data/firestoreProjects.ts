import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUid } from "./authState.svelte";
import type { AsyncProject } from "./schema";

function membershipId(uid: string, projectId: string) {
  return `${uid}_${projectId}`;
}

export async function createProject(projectData: Omit<AsyncProject, "id">) {
  const uid = getUid();
  if (!uid) throw new Error("Not signed in");

  const projectRef = await addDoc(collection(db, "projects"), {
    ...projectData,
    ownerUid: uid,
    created: serverTimestamp(),
    modified: serverTimestamp(),
  });

  await setDoc(doc(db, "projectMembers", membershipId(uid, projectRef.id)), {
    projectId: projectRef.id,
    uid,
    role: "owner",
    status: "active",
    joinedAt: serverTimestamp(),
  });

  return projectRef.id;
}

export async function getUserProjects() {
  const uid = getUid();
  if (!uid) throw new Error("Not signed in");

  const memberSnap = await getDocs(
    query(
      collection(db, "projectMembers"),
      where("uid", "==", uid),
      where("status", "==", "active")
    )
  );
  const projectIds = memberSnap.docs.map((d) => d.data().projectId as string);

  const projects = await Promise.all(
    projectIds.map(async (id) => {
      const projSnap = await getDoc(doc(db, "projects", id));
      return projSnap.exists() ? { id: projSnap.id, ...projSnap.data() } : null;
    })
  );

  return projects.filter((p) => p !== null);
}

export async function addMember(
  projectId: string,
  uid: string,
  role: "editor" | "viewer"
) {
  await setDoc(doc(db, "projectMembers", membershipId(uid, projectId)), {
    projectId,
    uid,
    role,
    status: "active",
    joinedAt: serverTimestamp(),
  });
}