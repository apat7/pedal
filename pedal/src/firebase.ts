// Firebase configuration and initialization
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyBPCuI-f8HuBXxUPEAqbXa1RqdFhtJdXu8",
    authDomain: "pedal-653f9.firebaseapp.com",
    projectId: "pedal-653f9",
    storageBucket: "pedal-653f9.firebasestorage.app",
    messagingSenderId: "422488774712",
    appId: "1:422488774712:web:d10869576ff53ab47b6ecd",
    measurementId: "G-8C07NBN557"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getDatabase(app);
