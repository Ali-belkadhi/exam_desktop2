/**
 * Model : Student
 * Représente un étudiant dans le système.
 */
class Student {
    constructor(data = {}) {
        this.id                = data._id || data.id || null;
        this.studentCardNumber = data.studentCardNumber || '';
        this.nom               = data.nom    || '';
        this.prenom            = data.prenom || '';
        this.cin               = data.cin    || '';
        this.email             = data.email  || '';
        this.contact           = data.contact || '';
        this.classe            = data.classe  || null;
    }

    /** Nom complet "Prénom NOM" */
    get fullName() {
        return `${this.prenom} ${this.nom}`.trim() || this.studentCardNumber;
    }

    /** Initiales pour avatar */
    get initials() {
        const p = this.prenom?.[0] || '';
        const n = this.nom?.[0]    || '';
        return (p + n).toUpperCase() || 'ET';
    }
}
