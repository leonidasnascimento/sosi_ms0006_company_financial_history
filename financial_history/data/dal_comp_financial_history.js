const admin = require('firebase-admin');
const db_collection = 'company_finacial_history'

let service_account = require('../sosi_gcp_nosql_service_account.json');

module.exports = class {
    add(obj, on_success, on_error) {
        this.initialize_app();

        let db = admin.firestore()
        let doc_ref = db.collection(db_collection).doc(obj.code.toString());

        doc_ref
            .set(obj)
            .then(data => {
                on_success(data);
            })
            .catch(data => {
                on_error(data);
            });
    }

    get(doc_id, on_success, on_error) {
        this.initialize_app();

        let db = admin.firestore();
        db.collection(db_collection).doc(doc_id)
            .get()
            .then((doc) => {
                on_success(doc.data())
            })
            .catch((err) => {
                on_error('Error getting documents => ' + err)
            });
    }

    getAll(on_success, on_error) {
        this.initialize_app();
        let data = [];

        admin.firestore().collection(db_collection)
            .get()
            .then(doc => {
                doc.docs.forEach(d => {
                    data.push(d.data());
                })

                on_success(data)
            })
            .catch((err) => {
                on_error('Error getting documents => ' + err)
            });
    }

    initialize_app() {
        if (admin.apps.length <= 0) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    clientEmail: service_account.client_email,
                    privateKey: String(service_account.private_key).replace(/\\n/g, '\n'),
                    projectId: service_account.project_id
                }),
                databaseURL: "https://" + String(service_account.project_id) + ".firebaseio.com"
            });
        }
    }
}