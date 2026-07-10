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
        apiKey: '',      // e.g. 'AIza...'
        projectId: '',   // e.g. 'merid-app'
        // Where the "View my deck" popup button points.
        webDeckUrl: 'https://merid.site/my-deck'
    };
});
