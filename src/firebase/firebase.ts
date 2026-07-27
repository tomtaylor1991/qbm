import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBUb8fORStnDcTrdPWxncpphTpAWIrwtKs",
  authDomain: "qbm-test.firebaseapp.com",
  projectId: "qbm-test",
  storageBucket: "qbm-test.firebasestorage.app",
  messagingSenderId: "937862000143",
  appId: "1:937862000143:web:e7f2664e6cdd58ae78bd7a",
  measurementId: "G-6NWLG34YNX"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);