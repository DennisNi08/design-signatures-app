import { collection, query, where, onSnapshot, type Unsubscribe} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { db, auth } from "./firebase"

let pendingInviteCount = $state(0)
let unsubscribeInvites: Unsubscribe | null = null;

onAuthStateChanged( auth, (user )=> {
  if (unsubscribeInvites){
    unsubscribeInvites()
    unsubscribeInvites = null
  }
  if (user?.email) {
    const q = query(
       collection(db, "projectInvites"),
      where("email", "==", user.email.toLowerCase()),
    where("status","==","pending"));
    unsubscribeInvites = onSnapshot(
      q,
      (snap) => {
        pendingInviteCount = snap.size;
      },
      (err) => {
        console.error("Invite notification listener failed", err);
        pendingInviteCount = 0;
      }
    );
  }else{
    pendingInviteCount =0;
  }
  });

  export function getPendingInviteCount(){
    return pendingInviteCount;
  }