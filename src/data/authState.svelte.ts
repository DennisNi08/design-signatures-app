import { onAuthStateChanged,type User } from "firebase/auth";
import { auth } from "./firebase";

let user: User | null = $state(null)
let loading = $state(true)

onAuthStateChanged( auth, async (firebaseUser) => {
  if (firebaseUser) {
    await firebaseUser.getIdToken();
}
user = firebaseUser;
    loading = false;  }
  );

export function getUser() {
    return user;
}

export function isLoading() {
    return loading;
}

export function getUid(): string | null {
   return user?.uid ?? null;
}