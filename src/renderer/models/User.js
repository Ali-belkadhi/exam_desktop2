/**
 * Model : User
 * Représente l'entité métier de l'utilisateur.
 */
class User {
    constructor(id, name, email, role, token) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.role = role;
        this.token = token;
    }
}
