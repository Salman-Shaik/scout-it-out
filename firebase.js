// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA2epRKhjqJZD1efnlV5ucgQ_BVK9UqVvA",
  authDomain: "lightmasters-scout-it-out.firebaseapp.com",
  projectId: "lightmasters-scout-it-out",
  storageBucket: "lightmasters-scout-it-out.appspot.com",
  messagingSenderId: "583355338615",
  appId: "1:583355338615:web:ada1624d95dca5c98f9b72",
  measurementId: "G-T3JC8CSRMG",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
