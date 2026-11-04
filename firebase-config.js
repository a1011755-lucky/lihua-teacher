// Firebase 設定（從 Firebase 主控台複製）。
// 這些資料公開是正常的，資料安全靠 firestore.rules 的規則保護。
// apiKey 還是「請貼上」時，網站會自動改用「本機題庫」（存在這台電腦的瀏覽器）。
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcWJW37TJript_JlGTXY2x241b2Hjieys",
  authDomain: "jwen-57649.firebaseapp.com",
  projectId: "jwen-57649",
  storageBucket: "jwen-57649.firebasestorage.app",
  messagingSenderId: "1058987353105",
  appId: "1:1058987353105:web:ad8ba731c171c8db87bdb0"
};

// 可以審核、刪除題目的老師帳號（要和 firestore.rules 裡的名單一致）
window.ADMIN_EMAILS = ["a1011755@gmail.com"];
