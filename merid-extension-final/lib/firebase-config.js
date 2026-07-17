// =============================================================
// Merid - Firebase project identifiers (cloud sync is OPTIONAL).
//
// These values identify the Firebase project; they are NOT secrets. All access
// control is enforced server-side by Firestore security rules (see
// firestore.rules at the repo root) - a leaked apiKey cannot read anyone's
// data. See docs/FIREBASE_SETUP.md for how to create the project and (if you
// restrict the web API key by referrer) how to mint a separate key for the
// extension.
//
// Leave apiKey/projectId EMPTY to ship the extension fully local-only:
// every sync/auth feature disables itself and no network request is made.
// =============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.VMFirebaseConfig = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
    return {
        apiKey: 'AIzaSyDTGSltJ0fWy7K-oKqDQA-N-02_B6Ys-Xg',
        projectId: 'merid-49dd5',
        // OAuth 2.0 **Web** client ID for one-click "Sign in with Google"
        // (the Google account picker). Setup - see docs/FIREBASE_SETUP.md:
        //   1. Firebase console -> Authentication -> Sign-in method -> enable Google.
        //   2. Google Cloud console -> APIs & Services -> Credentials -> the
        //      auto-created "Web client" -> add this extension's redirect URI
        //      https://<EXTENSION_ID>.chromiumapp.org/ to "Authorized redirect URIs".
        //   3. Paste that Web client ID here. Leave EMPTY to hide nothing but
        //      make the button explain what's missing (it is NOT a secret).
        googleClientId: '',
        // Where the "View my deck" popup button points.
        webDeckUrl: 'https://merid.site/my-deck'
    };
});
