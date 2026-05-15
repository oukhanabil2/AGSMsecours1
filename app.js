// ==================== SGA v8.0 - APPLICATION COMPLÈTE ====================
console.log("🚀 SGA v8.0 - Application chargée");

// ==================== PARTIE 1 : CONSTANTES & CONFIGURATION ====================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwlE0KOxF68qKG7p5EgHAqkKv4z2rpTCubn707iBlN81C70tpKS3XUN_Pp0L6PlpLvKA/exec";
const SHEET_BEST_BASE_URL = APPS_SCRIPT_URL;

const JOURS_FRANCAIS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_FRANCAIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const SHIFT_LABELS = {'1': 'Matin', '2': 'Après-midi', '3': 'Nuit', 'R': 'Repos', 'C': 'Congé', 'M': 'Maladie', 'A': 'Autre absence', '-': 'Non défini'};
const SHIFT_COLORS = {'1': '#3498db', '2': '#e74c3c', '3': '#9b59b6', 'R': '#2ecc71', 'C': '#f39c12', 'M': '#e67e22', 'A': '#95a5a6', '-': '#7f8c8d'};
// ==================== FONCTION DE NETTOYAGE DES DATES ====================
function cleanAllDatesInPlanning(data) {
    const cleaned = {};
    for (const [monthKey, agentsData] of Object.entries(data)) {
        cleaned[monthKey] = {};
        for (const [agentCode, days] of Object.entries(agentsData)) {
            cleaned[monthKey][agentCode] = {};
            for (const [dateStr, shiftData] of Object.entries(days)) {
                let cleanDate = dateStr;
                if (cleanDate.includes('T')) {
                    cleanDate = cleanDate.split('T')[0];
                }
                if (cleanDate.includes('+')) {
                    cleanDate = cleanDate.split('+')[0];
                }
                if (!cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) {
                        cleanDate = d.getFullYear() + '-' + 
                                   String(d.getMonth() + 1).padStart(2,'0') + '-' + 
                                   String(d.getDate()).padStart(2,'0');
                    }
                }
                cleaned[monthKey][agentCode][cleanDate] = shiftData;
            }
        }
    }
    return cleaned;
}

let agents = [];
let planningData = {};
let holidays = [];
let panicCodes = [];
let radios = [];
let uniforms = [];
let warnings = [];
let replacementNotifications = [];
let autoSaveInterval = null;
let currentUser = null;
let soldesConges = [];   // SEULE variable pour les soldes (stockage annuel)
let notifications = [];
let congesList = [];   // Liste des périodes de congés (agentCode, startDate, endDate, type, comment, joker)
// ==================== FONCTION UTILITAIRE DE DATE (CORRECTION TIMEZONE) ====================
function formatDateUTC(date) {
    if (!date) return '';
    if (typeof date === 'string') {
        const clean = date.split('T')[0];
        if (clean.match(/^\d{4}-\d{2}-\d{2}$/)) return clean;
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


let users = [
    { id: 1, username: "admin", password: "NABIL1974", role: "ADMIN", nom: "Admin", prenom: "Système", groupe: null, agentCode: null },
    { id: 2, username: "cp_a", password: "CPA123", role: "CP", nom: "OUKHA", prenom: "NABIL", groupe: "A", agentCode: "CPA" },
    { id: 3, username: "cp_b", password: "CPB123", role: "CP", nom: "CHMAREKH", prenom: "Noureddine", groupe: "B", agentCode: "CPB" },
    { id: 4, username: "cp_c", password: "CPC123", role: "CP", nom: "BERRIMA", prenom: "ABDELHAK", groupe: "C", agentCode: "CPC" },
    { id: 5, username: "cp_d", password: "CPD123", role: "CP", nom: "YAGOUB", prenom: "mouhcine", groupe: "D", agentCode: "CPD" },
    { id: 6, username: "agent_a001", password: "AGENT123", role: "AGENT", nom: "Durand", prenom: "Jean", groupe: null, agentCode: "A001" },
];
// PARTIE 30 
// Synchronisation des utilisateurs
async function loadSharedUsers() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Utilisateurs`);
        if (!response.ok) throw new Error("Erreur réseau");
        const cloudUsers = await response.json();
        if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
            users = cloudUsers;
            localStorage.setItem('sga_users', JSON.stringify(users));
            console.log(`✅ Utilisateurs chargés (${users.length})`);
        } else {
            console.log("Aucun utilisateur cloud → conservation locale");
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur chargement utilisateurs", err);
        return false;
    }
}

async function saveSharedUsers() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || users.length === 0) {
        console.warn("Sauvegarde utilisateurs ignorée : aucun utilisateur ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = users.map(u => ({
            id: u.id,
            username: u.username,
            password: u.password,
            role: u.role,
            nom: u.nom || '',
            prenom: u.prenom || '',
            groupe: u.groupe || '',
            agentCode: u.agentCode || ''
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Utilisateurs&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Utilisateurs sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde utilisateurs", err);
    }
}
// ==================== PARTIE 2 : FONCTIONS CLOUD (AGENTS & CONGÉS) ====================
async function loadSharedAgents() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Agents`);
        if (!response.ok) throw new Error("Erreur réseau");
        const cloudAgents = await response.json();
        agents = cloudAgents.map(row => ({
            code: row.Code || '',
            nom: row.Nom || '',
            prenom: row.Prénom || '',
            groupe: row.Groupe || '',
            tel: row.Tel || '',
            matricule: row.Matricule || '',
            cin: row.Cin || '',
            poste: row.Poste || '',
            date_entree: row.DateEntree || '',
            statut: row.Statut ? row.Statut.trim().toLowerCase() : 'actif',
            adresse: row.Adresse || '',
            email: row.Email || '',
            date_naissance: row.Date_Naissance || '',
            date_sortie: row.DateSortie || null
        }));
        localStorage.setItem('sga_agents', JSON.stringify(agents));
        console.log(`✅ ${agents.length} agents chargés`);
      
// alert("Nombre d'agents reçus : " + cloudAgents.length); // <-- AJOUTEZ CETTE LIGNE
        
        if (typeof showSnackbar === 'function') showSnackbar(`✅ ${agents.length} agents synchronisés`);
        return true;
    } catch (erreur) {
        console.error("❌ Erreur chargement", erreur);
        if (typeof showSnackbar === 'function') showSnackbar("Erreur de chargement des agents");
        return false;
    }
}

async function saveSharedAgents() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || agents.length === 0) {
        console.warn("Sauvegarde agents ignorée : aucun agent ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = agents.map(a => ({
            Code: a.code,
            Nom: a.nom,
            Prénom: a.prenom,
            Groupe: a.groupe,
            Tel: a.tel || '',
            Matricule: a.matricule || '',
            Cin: a.cin || '',
            Poste: a.poste || '',
            DateEntree: a.date_entree ? formatDateUTC(a.date_entree) : '',
            Statut: a.statut === 'actif' ? 'Actif' : 'Inactif',
            Adresse: a.adresse || '',
            Email: a.email || '',
            Date_Naissance: a.date_naissance ? formatDateUTC(a.date_naissance) : '',
            DateSortie: a.date_sortie ? formatDateUTC(a.date_sortie) : ''
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Agents&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Agents sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde agents", err);
    }
}
async function saveSharedPlanning() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || Object.keys(planningData).length === 0) {
        console.warn("Sauvegarde planning ignorée : planning vide ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = [];
        for (const [monthKey, agentsData] of Object.entries(planningData)) {
            for (const [agentCode, days] of Object.entries(agentsData)) {
                for (const [dateStr, shiftData] of Object.entries(days)) {
                    let cleanDate = formatDateUTC(dateStr);
                    dataToSend.push({
                        AgentCode: agentCode,
                        Date: cleanDate,
                        Shift: shiftData.shift,
                        Type: shiftData.type || 'theorique',
                        Commentaire: shiftData.comment || '',
                        Replaces: shiftData.replaces || ''
                    });
                }
            }
        }
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Planning&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Planning sauvegardé");
    } catch (err) {
        console.error("❌ Erreur sauvegarde planning", err);
    }
}
// ==================== SYNCHRONISATION SOLDES CONGÉS ====================
async function loadSharedSoldes() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Soldes`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cloudSoldes = await response.json();
        if (Array.isArray(cloudSoldes) && cloudSoldes.length > 0) {
            soldesConges = cloudSoldes.map(s => ({
                agentCode: s.AgentCode,
                annee: s.Annee,
                droitAnnuel: s.DroitAnnuel,
                reportAnt: s.ReportAnt,
                totalDispo: s.TotalDispo,
                pris: s.Pris,
                reste: s.Reste
            }));
            localStorage.setItem('sga_soldes_conges', JSON.stringify(soldesConges));
            console.log(`✅ Soldes chargés (${soldesConges.length})`);
        } else {
            console.log("Aucun solde cloud → conservation locale");
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur chargement soldes", err);
        return false;
    }
}

async function saveSharedSoldes() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || soldesConges.length === 0) {
        console.warn("Sauvegarde soldes ignorée : aucun solde ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = soldesConges.map(s => ({
            AgentCode: s.agentCode,
            Annee: s.annee,
            DroitAnnuel: s.droitAnnuel,
            ReportAnt: s.reportAnt,
            TotalDispo: s.totalDispo,
            Pris: s.pris,
            Reste: s.reste
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Soldes&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Soldes sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde soldes", err);
    }
}

// ==================== SYNCHRONISATION PANIQUE ====================
async function loadSharedPanique() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Panique`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cloudPanique = await response.json();
        if (Array.isArray(cloudPanique) && cloudPanique.length > 0) {
            panicCodes = cloudPanique.map(p => ({
                agent_code: p.AgentCode,
                code: p.Code,
                poste: p.Poste || '',
                comment: p.Commentaire || '',
                created_at: new Date().toISOString()
            }));
            localStorage.setItem('sga_panic_codes', JSON.stringify(panicCodes));
            console.log(`✅ Codes panique chargés (${panicCodes.length})`);
        } else {
            console.log("Aucun code panique dans le cloud → conservation des données locales");
            // panicCodes reste inchangé
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur chargement panique", err);
        return false;
    }
}

async function saveSharedPanique() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || panicCodes.length === 0) {
        console.warn("Sauvegarde panique ignorée : aucun code ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = panicCodes.map(p => ({
            AgentCode: p.agent_code,
            Code: p.code,
            Poste: p.poste || '',
            Commentaire: p.comment || ''
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Panique&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Codes panique sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde panique", err);
    }
}
async function saveSharedPanique() {
    if (!APPS_SCRIPT_URL) return;
    try {
        const dataToSend = panicCodes.map(p => ({
            AgentCode: p.agent_code,
            Code: p.code,
            Poste: p.poste || '',
            Commentaire: p.comment || ''
        }));
       //   console.log("Envoi Panique:", dataToSend);
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Panique&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(`Réponse du serveur: ${text}`);
        console.log("✅ Codes panique sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde panique", err);
        alert("Erreur sauvegarde panique: " + err.message);
    }
}



// ==================== SYNCHRONISATION HABILLEMENT ====================
async function loadSharedHabillement() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Habillement`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cloudHabillement = await response.json();
        if (Array.isArray(cloudHabillement) && cloudHabillement.length > 0) {
            uniforms = cloudHabillement.map(u => ({
                agentCode: u.AgentCode,
                date: u.Date,
                articles: u.Articles ? (typeof u.Articles === 'string' ? u.Articles.split(',') : u.Articles) : [],
                comment: u.Commentaire || '',
                lastUpdated: u.LastUpdated || new Date().toISOString()
            }));
            localStorage.setItem('sga_uniforms', JSON.stringify(uniforms));
            console.log(`✅ Habillement chargé (${uniforms.length})`);
        } else {
        //  console.log("Aucune donnée habillement dans le cloud → conservation locale");
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur chargement habillement", err);
        return false;
    }
}

async function saveSharedHabillement() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || uniforms.length === 0) {
        console.warn("Sauvegarde habillement ignorée : aucun uniforme ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = uniforms.map(u => ({
            AgentCode: u.agentCode,
            Date: u.date,
            Articles: Array.isArray(u.articles) ? u.articles.join(', ') : u.articles,
            Commentaire: u.comment || '',
            LastUpdated: u.lastUpdated || new Date().toISOString()
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Habillement&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Habillement sauvegardé");
    } catch (err) {
        console.error("❌ Erreur sauvegarde habillement", err);
    }
}


// ==================== SYNCHRONISATION AVERTISSEMENTS ====================
async function loadSharedAvertissements() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Avertissements`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cloudAvertissements = await response.json();
        if (Array.isArray(cloudAvertissements) && cloudAvertissements.length > 0) {
            warnings = cloudAvertissements.map(w => ({
                id: w.Id,
                agent_code: w.AgentCode,
                type: w.Type,
                date: w.Date,
                description: w.Description,
                status: w.Statut || 'active',
                created_at: new Date().toISOString()
            }));
            localStorage.setItem('sga_warnings', JSON.stringify(warnings)) 
     // console.log(`✅ Avertissements chargés (${warnings.length})`);
        } else {
         //    console.log("Aucun avertissement dans le cloud → conservation locale");
        }
        return true;
    } catch (err) {
        console.error("❌ Erreur chargement avertissements", err);
        return false;
    }
}

async function saveSharedAvertissements() {
    if (!APPS_SCRIPT_URL) return;
    if (!currentUser || warnings.length === 0) {
        console.warn("Sauvegarde avertissements ignorée : aucun avertissement ou utilisateur non connecté");
        return;
    }
    try {
        const dataToSend = warnings.map(w => ({
            Id: w.id,
            AgentCode: w.agent_code,
            Type: w.type,
            Date: w.date,
            Description: w.description,
            Statut: w.status
        }));
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Avertissements&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text !== "OK") throw new Error(text);
        console.log("✅ Avertissements sauvegardés");
    } catch (err) {
        console.error("❌ Erreur sauvegarde avertissements", err);
    }
}
// ==================== SYNCHRONISATION CONGÉS ====================
async function loadSharedConges() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Conges`);
        if (!response.ok) throw new Error("Erreur réseau");
        const cloudConges = await response.json();
        
        congesList = cloudConges.map(c => ({
            agentCode: c.AgentCode,
            startDate: c.DateDebut,
            endDate: c.DateFin,
            type: c.Type,
            comment: c.Commentaire || '',
            joker: c.Joker || null
        }));
        
        localStorage.setItem('sga_conges', JSON.stringify(congesList));
        console.log(`✅ Congés chargés (${congesList.length} périodes)`);
        if (typeof showSnackbar === 'function') showSnackbar(`✅ ${congesList.length} périodes de congés synchronisées`);
        return true;
    } catch (erreur) {
        console.error("❌ Erreur chargement congés", erreur);
        return false;
    }
}

async function saveSharedConges() {
    if (!APPS_SCRIPT_URL) return;
    try {
        const dataToSend = congesList.map(c => ({
            AgentCode: c.agentCode,
            DateDebut: c.startDate,
            DateFin: c.endDate,
            Type: c.type,
            Commentaire: c.comment || '',
            Joker: c.joker || ''
        }));
        
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Conges&replace=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(dataToSend)
        });
        const text = await response.text();
        if (text === "OK") {
            console.log("✅ Congés sauvegardés");
            if (typeof showSnackbar === 'function') showSnackbar("✅ Congés synchronisés");
        } else {
            throw new Error(text);
        }
    } catch (err) {
        console.error("❌ Erreur sauvegarde congés", err);
        if (typeof showSnackbar === 'function') showSnackbar("❌ Erreur synchronisation congés");
    }
}
async function loadSharedPlanning() {
    if (!APPS_SCRIPT_URL) return false;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?tab=Planning`);
        if (!response.ok) throw new Error("Erreur réseau");
        const cloudPlanning = await response.json();
        
        const newPlanningData = {};
        for (const item of cloudPlanning) {
            let cleanDate = item.Date;
            
            // ✅ CORRECTION : Si la date est un objet Date JavaScript
            if (cleanDate && typeof cleanDate === 'object' && cleanDate.getFullYear) {
                const year = cleanDate.getFullYear();
                const month = String(cleanDate.getMonth() + 1).padStart(2, '0');
                const day = String(cleanDate.getDate()).padStart(2, '0');
                cleanDate = `${year}-${month}-${day}`;
            }
            // Si c'est une string, nettoyer
            else if (typeof cleanDate === 'string') {
                cleanDate = cleanDate.split('T')[0];
                // Vérifier si la date a été décalée (ex: 2026-05-27 au lieu de 2026-05-28)
                // On ne peut pas corriger automatiquement, mieux vaut prévenir
            }
            
            if (!cleanDate || !cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
            
            const monthKey = cleanDate.substring(0,7);
            const agentCode = item.AgentCode;
            if (!newPlanningData[monthKey]) newPlanningData[monthKey] = {};
            if (!newPlanningData[monthKey][agentCode]) newPlanningData[monthKey][agentCode] = {};
            newPlanningData[monthKey][agentCode][cleanDate] = {
    shift: item.Shift,
    type: item.Type || 'theorique',
    comment: item.Commentaire || '',
    replaces: item.Replaces || null   // ← Ajout
};
        }
        planningData = newPlanningData;
        localStorage.setItem('sga_planning', JSON.stringify(planningData));
        console.log(`✅ Planning chargé`);
        return true;
    } catch (erreur) {
        console.error("❌ Erreur chargement planning", erreur);
        return false;
    }
}


async function loadSharedLeaves() {
    if (!SHEET_BEST_BASE_URL) return false;
    try {
        const reponse = await fetch(`${SHEET_BEST_BASE_URL}/sheet`);
        const cloudLeaves = await reponse.json();
        if (cloudLeaves && cloudLeaves.length > 0) {
            let count = 0;
            cloudLeaves.forEach(leave => {
                if (!leave.Agent || !leave.DateDebut) return;
                const start = new Date(leave.DateDebut);
                const end = new Date(leave.DateFin);
                let current = new Date(start);
                while (current <= end) {
                    const dateStr = current.toISOString().split('T')[0];
                    const monthKey = dateStr.substring(0, 7);
                    if (!planningData[monthKey]) planningData[monthKey] = {};
                    if (!planningData[monthKey][leave.Agent]) planningData[monthKey][leave.Agent] = {};
                    planningData[monthKey][leave.Agent][dateStr] = {
                        shift: leave.Type || 'C',
                        type: 'congé_cloud',
                        comment: leave.Commentaire || ''
                    };
                    current.setDate(current.getDate() + 1);
                    count++;
                }
            });
            localStorage.removeItem('sga_planning');
loadSharedPlanning().then(() => location.reload());
         //   console.log(`✅ ${cloudLeaves.length} congés chargés du cloud (${count} jours)`);
            return true;
        }
    } catch (erreur) {
      //  console.log("⚠️ Cloud congés indisponible", erreur);
    }
    return false;
}

async function saveLeaveToCloud(agentCode, startDate, endDate, type, comment, joker) {
    if (!SHEET_BEST_BASE_URL) return;
    try {
        const newLeave = {
            Agent: agentCode,
            DateDebut: startDate,
            DateFin: endDate,
            Type: type,
            Commentaire: comment || '',
            RemplacePar: joker || '',
            DateCreation: new Date().toISOString().split('T')[0]
        };
        await fetch(SHEET_BEST_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLeave)
        });
       //  console.log("✅ Congé sauvegardé dans le cloud");
    } catch (erreur) {
        console.error("❌ Erreur sauvegarde congé", erreur);
    }
}

async function deleteLeaveFromCloud(agentCode, startDate, endDate) {
    if (!SHEET_BEST_BASE_URL) return;
    try {
        const reponse = await fetch(SHEET_BEST_BASE_URL);
        const allLeaves = await reponse.json();
        const toDelete = allLeaves.find(l => l.Agent === agentCode && l.DateDebut === startDate && l.DateFin === endDate);
        if (toDelete && toDelete.id) {
            await fetch(`${SHEET_BEST_BASE_URL}/${toDelete.id}`, { method: 'DELETE' });
          //  console.log("✅ Congé supprimé du cloud");
        }
    } catch (erreur) {
        console.error("❌ Erreur suppression congé", erreur);
    }
}

// ==================== PARTIE 3 : FONCTIONS DE BASE (SAVE / LOAD / INIT) ====================
function saveData() {
    // Sauvegarde locale (localStorage)
    localStorage.setItem('sga_users', JSON.stringify(users));
    localStorage.setItem('sga_agents', JSON.stringify(agents));
    localStorage.setItem('sga_planning', JSON.stringify(planningData));
    localStorage.setItem('sga_holidays', JSON.stringify(holidays));
    localStorage.setItem('sga_panic_codes', JSON.stringify(panicCodes));
    localStorage.setItem('sga_radios', JSON.stringify(radios));
    localStorage.setItem('sga_uniforms', JSON.stringify(uniforms));
    localStorage.setItem('sga_warnings', JSON.stringify(warnings));
    localStorage.setItem('sga_notifications', JSON.stringify(replacementNotifications));
    localStorage.setItem('sga_sys_notifications', JSON.stringify(notifications));
    localStorage.setItem('sga_soldes_conges', JSON.stringify(soldesConges));
    
    // Synchronisation cloud (sans attendre pour ne pas bloquer l'UI)
    saveSharedAgents();
    saveSharedPlanning();
    
    if (panicCodes.length > 0) saveSharedPanique();
    if (uniforms.length > 0) saveSharedHabillement();
    if (warnings.length > 0) saveSharedAvertissements();
    saveSharedPanique();      // doit exister
    saveSharedHabillement();  // doit exister
     saveSharedUsers();
    saveSharedAvertissements();// doit exister
saveSharedSoldes();
    console.log("💾 Sauvegarde locale + cloud lancée");
}

async function loadData() {
    try {
        // 1. Chargement depuis localStorage (rapide)
        const savedUsers = localStorage.getItem('sga_users');
        if (savedUsers) users = JSON.parse(savedUsers);
        
        const rawPlanning = JSON.parse(localStorage.getItem('sga_planning') || '{}');
        planningData = cleanAllDatesInPlanning ? cleanAllDatesInPlanning(rawPlanning) : rawPlanning;
        
        holidays = JSON.parse(localStorage.getItem('sga_holidays') || '[]');
        panicCodes = JSON.parse(localStorage.getItem('sga_panic_codes') || '[]');
        radios = JSON.parse(localStorage.getItem('sga_radios') || '[]');
        uniforms = JSON.parse(localStorage.getItem('sga_uniforms') || '[]');
        warnings = JSON.parse(localStorage.getItem('sga_warnings') || '[]');
        replacementNotifications = JSON.parse(localStorage.getItem('sga_notifications') || '[]');
        notifications = JSON.parse(localStorage.getItem('sga_sys_notifications') || '[]');
        soldesConges = JSON.parse(localStorage.getItem('sga_soldes_conges') || '[]');
        
        if (holidays.length === 0) initializeHolidays();
        
        const savedAgents = localStorage.getItem('sga_agents');
        if (savedAgents && savedAgents.length > 0) {
            agents = JSON.parse(savedAgents);
        } else {
            if (agents.length === 0) initializeDemoAgents();
        }
        
        // 2. Synchronisation cloud (avec gestion d'erreur)
        try {
            await loadSharedAgents();
        } catch(e) { console.warn("Agents cloud:", e); }
        
        try {
            await loadSharedPlanning();
        } catch(e) { console.warn("Planning cloud:", e); }
        
        try {
            await loadSharedUsers();
        } catch(e) { console.warn("Users cloud:", e); }
        
        try {
            await loadSharedPanique();
        } catch(e) { console.warn("Panique cloud:", e); }
        
        try {
            await loadSharedHabillement();
        } catch(e) { console.warn("Habillement cloud:", e); }
        
        try {
            await loadSharedAvertissements();
        } catch(e) { console.warn("Avertissements cloud:", e); }
        
        // 3. Affichage du menu seulement après tous les chargements
        if (currentUser) {
            displayMainMenu();
        }
        
        console.log("✅ loadData terminé avec succès");
    } catch (err) {
        console.error("❌ Erreur dans loadData:", err);
        // Afficher quand même le menu avec les données disponibles
        if (currentUser) displayMainMenu();
    }
}


async function syncAgentsFromCloud() {
    const success = await loadSharedAgents();
    if (!success && typeof showSnackbar === 'function') {
        showSnackbar("⚠️ Synchronisation cloud échouée, données locales affichées");
    }
}

setInterval(() => { if (currentUser) syncAgentsFromCloud(); }, 5 * 60 * 1000);

function initializeHolidays() {
    holidays = [
        { date: "01-01", description: "Nouvel An", isRecurring: true, type: "fixe" },
        { date: "01-11", description: "Indépendance", isRecurring: true, type: "fixe" },
        { date: "05-01", description: "Fête du Travail", isRecurring: true, type: "fixe" },
        { date: "07-30", description: "Fête du Trône", isRecurring: true, type: "fixe" },
        { date: "08-14", description: "Oued Eddahab", isRecurring: true, type: "fixe" },
        { date: "08-20", description: "Révolution", isRecurring: true, type: "fixe" },
        { date: "08-21", description: "Fête de la Jeunesse", isRecurring: true, type: "fixe" },
        { date: "11-06", description: "Marche Verte", isRecurring: true, type: "fixe" },
        { date: "11-18", description: "Indépendance", isRecurring: true, type: "fixe" }
    ];
}

function initializeDemoAgents() {
    agents = [
        { code: 'A001', nom: 'Durand', prenom: 'Jean', groupe: 'A', tel: '0612345678', matricule: 'MAT001', cin: 'AA111111', poste: 'Agent', date_entree: '2024-01-01', statut: 'actif', date_sortie: null, adresse: 'Paris', email: 'jean.durand@email.com' },
        { code: 'A002', nom: 'Petit', prenom: 'Marie', groupe: 'A', tel: '0623456789', matricule: 'MAT002', cin: 'BB222222', poste: 'Agent', date_entree: '2024-01-01', statut: 'actif', date_sortie: null, adresse: 'Lyon', email: 'marie.petit@email.com' },
        { code: 'B001', nom: 'Martin', prenom: 'Paul', groupe: 'B', tel: '0634567890', matricule: 'MAT003', cin: 'CC333333', poste: 'Agent', date_entree: '2024-01-01', statut: 'actif', date_sortie: null, adresse: 'Marseille', email: 'paul.martin@email.com' },
        { code: 'J001', nom: 'Joker', prenom: 'Un', groupe: 'J', tel: '0645678901', matricule: 'JOK001', cin: 'JJ444444', poste: 'Joker', date_entree: '2024-01-01', statut: 'actif', date_sortie: null, adresse: 'Casablanca', email: 'joker1@email.com' },
        { code: 'CPA', nom: 'OUKHA', prenom: 'NABIL', groupe: 'A', tel: '0681564713', adresse: 'sala Al jadida', poste: 'CP', cin: 'A758609', date_naissance: '1974-11-05', matricule: 'S09278C', date_entree: '2025-11-01', statut: 'actif' }
    ];
    saveData();
}

function checkPassword(action) {
    const pwd = prompt(`🔐 Confirmation pour: ${action}\nMot de passe administrateur:`);
    if (pwd !== "NABIL1974a") { alert("❌ Mot de passe incorrect!"); return false; }
    return true;
}

function showSnackbar(msg) {
    const snackbar = document.getElementById('snackbar');
    if (!snackbar) {
        console.log("Snackbar non disponible :", msg);
        return;
    }
    snackbar.textContent = msg;
    snackbar.className = "show";
    setTimeout(() => { snackbar.className = ""; }, 3000);
}

function getMonthName(month) { return MOIS_FRANCAIS[month - 1] || ''; }

function isHolidayDate(date) {
    const monthDay = `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    return holidays.some(h => h.isRecurring && h.date === monthDay);
}

function getHolidayDescription(date) {
    const monthDay = `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    const holiday = holidays.find(h => h.date === monthDay);
    return holiday || { description: 'Jour férié' };
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateToFrench(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

// ==================== PARTIE 4 : SYSTÈME DE LOGIN ====================
function showLogin() {
    const html = `
        <div class="login-overlay" id="loginOverlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); display:flex; justify-content:center; align-items:center; z-index:10000;">
            <div class="login-box" style="background:#2c3e50; padding:30px; border-radius:15px; width:350px; text-align:center; border:1px solid #f39c12;">
                <div style="text-align:center; margin-bottom:20px;">
                    <img src="logo.png" alt="Logo AGSM" style="max-width:100px; height:auto; border-radius:10px;">
                </div>
                <h2 style="color:#f39c12;">🏢 AGSM</h2>
                <h3 style="color:white;">Groupe ASW</h3>
                <p style="color:#bdc3c7; font-size:0.8rem;">Système de Gestion des Agents</p>
                <input type="text" id="loginUsername" placeholder="Nom d'utilisateur" style="width:100%; padding:12px; margin:10px 0; border-radius:5px; border:none; background:#34495e; color:white;">
                <input type="password" id="loginPassword" placeholder="Mot de passe" style="width:100%; padding:12px; margin:10px 0; border-radius:5px; border:none; background:#34495e; color:white;">
                <button class="popup-button green" onclick="doLogin()" style="width:100%;">Se connecter</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function doLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) { alert("❌ Identifiants incorrects!"); return; }
    currentUser = user;
    localStorage.setItem('sga_current_user', JSON.stringify({ id: user.id, username: user.username }));
    document.getElementById('loginOverlay').remove();
    const header = document.querySelector('.app-header');
    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'user-info';
    userInfoDiv.style.cssText = 'margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;';
    userInfoDiv.innerHTML = `
        <div id="notificationIcon" style="position:relative; cursor:pointer;"><span style="font-size:1.5rem;">🔔</span><span id="notificationBadge" style="position:absolute; top:-8px; right:-8px; background:#e74c3c; color:white; border-radius:50%; padding:2px 6px; font-size:0.7rem; font-weight:bold; display:none;">0</span></div>
        <span style="background:#f39c12; padding:4px 12px; border-radius:20px; font-size:0.8rem; color:#2c3e50;">${user.role === 'ADMIN' ? '👑 Admin' : (user.role === 'CP' ? '👥 CP Groupe ' + user.groupe : '👤 Agent')}</span>
        <span style="color:white;">${user.nom} ${user.prenom}</span>
        <button class="logout-btn" onclick="logout()" style="background:#e74c3c; border:none; padding:5px 12px; border-radius:20px; color:white; cursor:pointer;">🚪 Déconnexion</button>
    `;
    header.appendChild(userInfoDiv);
    attachNotificationClick();
    updateNotificationBadge();
    displayMainMenu();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('sga_current_user');
    const userInfoDiv = document.querySelector('.user-info');
    if (userInfoDiv) userInfoDiv.remove();
    showLogin();
}

function changeMyPassword() {
    const oldPwd = prompt("🔐 Mot de passe actuel :");
    if (oldPwd !== currentUser.password) { alert("❌ Mot de passe incorrect!"); return; }
    const newPwd = prompt("Nouveau mot de passe (minimum 4 caractères) :");
    if (!newPwd || newPwd.length < 4) { alert("❌ Le mot de passe doit contenir au moins 4 caractères"); return; }
    const confirmPwd = prompt("Confirmez le nouveau mot de passe :");
    if (newPwd !== confirmPwd) { alert("❌ Les mots de passe ne correspondent pas!"); return; }
    currentUser.password = newPwd;
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) users[userIndex].password = newPwd;
    saveData();
    alert("✅ Mot de passe modifié avec succès!");
}

// ==================== PARTIE 5 : GESTION DES SHIFTS ====================
function getReplacementInfo(agentCode, dateStr) {
    const monthKey = dateStr.substring(0,7);
    const agent = agents.find(a => a.code === agentCode);
    if (agent && agent.groupe === 'J') {
        for (const otherAgent of agents) {
            if (otherAgent.groupe === 'J') continue;
            const entry = planningData[monthKey]?.[otherAgent.code]?.[dateStr];
            if (entry && ['C', 'M', 'A'].includes(entry.shift)) {
                const notification = replacementNotifications.find(n => n.agent_absent === otherAgent.code && n.joker === agentCode && n.date_debut <= dateStr && n.date_fin >= dateStr);
                if (notification) return { type: 'remplace', agent: otherAgent.code };
                const jokerEntry = planningData[monthKey]?.[agentCode]?.[dateStr];
                if (jokerEntry && jokerEntry.type === 'remplacement_joker' && jokerEntry.comment && jokerEntry.comment.includes(otherAgent.code)) {
                    return { type: 'remplace', agent: otherAgent.code };
                }
            }
        }
        return null;
    }
    for (const joker of agents.filter(a => a.groupe === 'J')) {
        const jokerEntry = planningData[monthKey]?.[joker.code]?.[dateStr];
        if (jokerEntry && jokerEntry.type === 'remplacement_joker' && jokerEntry.comment && jokerEntry.comment.includes(agentCode)) {
            return { type: 'remplace_par', agent: joker.code };
        }
        const notification = replacementNotifications.find(n => n.agent_absent === agentCode && n.joker === joker.code && n.date_debut <= dateStr && n.date_fin >= dateStr);
        if (notification) return { type: 'remplace_par', agent: joker.code };
    }
    return null;
}

function getShiftDisplay(agentCode, dateStr) {
    const shift = getShiftForAgent(agentCode, dateStr);
    const replacement = getReplacementInfo(agentCode, dateStr);
    const agent = agents.find(a => a.code === agentCode);
    if (agent && agent.groupe === 'J' && replacement?.type === 'remplace') {
        const replacedAgent = agents.find(a => a.code === replacement.agent);
        const agentName = replacedAgent ? `${replacedAgent.nom} ${replacedAgent.prenom}` : replacement.agent;
        return `${shift} 🔄 Remplace ${agentName}`;
    }
    if (replacement?.type === 'remplace_par') {
        const jokerAgent = agents.find(a => a.code === replacement.agent);
        const jokerName = jokerAgent ? `${jokerAgent.nom} ${jokerAgent.prenom}` : replacement.agent;
        return `${shift} 🔄 Remplacé par ${jokerName}`;
    }
    return shift;
}

function getTheoreticalShift(agentCode, dateStr) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent || agent.statut !== 'actif') return '-';
    if (agent.groupe === 'J') return 'R';
    if (agent.groupe === 'E') {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return 'R';
        return date.getDate() % 2 === 0 ? '1' : '2';
    }
    const date = new Date(dateStr);
    const referenceDate = new Date(2025, 10, 1);
    const timeDiff = date - referenceDate;
    const daysSinceStart = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const groupOffset = { 'A': 0, 'B': 2, 'C': 4, 'D': 6 }[agent.groupe] || 0;
    let cycleDay = (daysSinceStart + groupOffset) % 8;
    if (cycleDay < 0) cycleDay += 8;
    if (cycleDay === 0 || cycleDay === 1) return '1';
    if (cycleDay === 2 || cycleDay === 3) return '2';
    if (cycleDay === 4 || cycleDay === 5) return '3';
    return 'R';
}

function findReplacedAgent(jokerCode, dateStr) {
    let cleanDate = formatDateUTC(dateStr);
    const monthKey = cleanDate.substring(0, 7);
    const jokerEntry = planningData[monthKey]?.[jokerCode]?.[cleanDate];
    
    // 1. Priorité au champ explicite "replaces"
    if (jokerEntry && jokerEntry.replaces) {
        const replacedAgent = agents.find(a => a.code === jokerEntry.replaces);
        if (replacedAgent) return replacedAgent;
    }
    // 2. Sinon, essayer via le commentaire (compatible avec anciennes données)
    if (jokerEntry && jokerEntry.comment) {
        const match = jokerEntry.comment.match(/Remplace (\w+)/);
        if (match && match[1]) {
            const replacedAgent = agents.find(a => a.code === match[1]);
            if (replacedAgent) return replacedAgent;
        }
    }
    // 3. Sinon, chercher dans replacementNotifications
    const notif = replacementNotifications.find(n => n.joker === jokerCode && n.date_debut <= cleanDate && n.date_fin >= cleanDate);
    if (notif && notif.agent_absent) {
        return agents.find(a => a.code === notif.agent_absent);
    }
    return null;
}

function getTheoreticalShiftWithoutAbsence(agentCode, dateStr) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent) return '-';
    if (agent.groupe === 'E') {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return 'R';
        return date.getDate() % 2 === 0 ? '1' : '2';
    }
    const date = new Date(dateStr);
    const referenceDate = new Date(2025, 10, 1);
    const timeDiff = date - referenceDate;
    const daysSinceStart = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const groupOffset = { 'A': 0, 'B': 2, 'C': 4, 'D': 6 }[agent.groupe] || 0;
    let cycleDay = (daysSinceStart + groupOffset) % 8;
    if (cycleDay < 0) cycleDay += 8;
    if (cycleDay === 0 || cycleDay === 1) return '1';
    if (cycleDay === 2 || cycleDay === 3) return '2';
    if (cycleDay === 4 || cycleDay === 5) return '3';
    return 'R';
}

function getJokerShift(jokerCode, dateStr) {
    return getShiftForAgent(jokerCode, dateStr);
}
function getShiftForAgent(agentCode, dateStr) {
    let cleanDate = formatDateUTC(dateStr);
    const monthKey = cleanDate.substring(0, 7);
    
    // 1. Vérifier une entrée manuelle (shift modifié ou remplacement)
    const existing = planningData[monthKey]?.[agentCode]?.[cleanDate];
    if (existing && existing.shift) return existing.shift;

    const agent = agents.find(a => a.code === agentCode);
    if (!agent || agent.statut !== 'actif') return '-';

    // 2. Cas des jokers : lecture directe du champ 'replaces'
    if (agent.groupe === 'J') {
        // Lire le code de l'agent remplacé depuis l'entrée du joker (persisté)
        const jokerEntry = planningData[monthKey]?.[agentCode]?.[cleanDate];
        let replacedAgentCode = jokerEntry?.replaces;
        if (!replacedAgentCode) {
            // Fallback : chercher via findReplacedAgent (pour les anciennes données)
            const replaced = findReplacedAgent(agentCode, cleanDate);
            replacedAgentCode = replaced?.code;
        }
        if (replacedAgentCode) {
            return getTheoreticalShiftWithoutAbsence(replacedAgentCode, cleanDate);
        }
        return 'R';
    }

    // 3. Pour les autres groupes, calcul théorique
    return getTheoreticalShift(agentCode, cleanDate);
}

function getAvailableJokersForDates(dates) {
    const jokers = agents.filter(a => a.groupe === 'J' && a.statut === 'actif');
    return jokers.filter(joker => {
        for (const dateStr of dates) {
            const monthKey = dateStr.substring(0,7);
            const existing = planningData[monthKey]?.[joker.code]?.[dateStr];
            if (existing && existing.type === 'remplacement_joker') return false;
            if (existing && ['C','M','A'].includes(existing.shift)) return false;
            const theoretical = getTheoreticalShift(joker.code, dateStr);
            if (theoretical !== 'R') return false;
        }
        return true;
    });
}

async function saveLeaveWithJoker() {
    const leaveType = document.getElementById('leaveType').value;
    const agentCode = document.getElementById('leaveAgent').value;
    const comment = document.getElementById('leaveComment').value;
    if (!agentCode) { alert("⚠️ Sélectionnez un agent"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }

    let dates = [], absenceType = 'C';
    if (leaveType === 'period') {
        const start = document.getElementById('periodStart').value;
        const end = document.getElementById('periodEnd').value;
        if (!start || !end) { alert("⚠️ Dates début et fin requises"); return; }
        let cur = new Date(start);
        const endDate = new Date(end);
        while (cur <= endDate) {
            dates.push(formatDateUTC(cur));
            cur.setDate(cur.getDate() + 1);
        }
        absenceType = 'C';
    } else {
        const date = document.getElementById('leaveDate').value;
        if (!date) { alert("⚠️ Date requise"); return; }
        dates = [formatDateUTC(date)];
        absenceType = document.getElementById('absenceType').value;
    }

    const daysToProcess = [];
    for (const dateStr of dates) {
        const date = new Date(dateStr);
        const isSunday = date.getDay() === 0;
        const theoreticalShift = getTheoreticalShift(agentCode, dateStr);
        if (isSunday) {
            daysToProcess.push({ dateStr, agentShift: 'R', jokerShift: theoreticalShift, isSunday: true });
        } else {
            daysToProcess.push({ dateStr, agentShift: absenceType, jokerShift: (theoreticalShift !== 'R') ? theoreticalShift : 'R', isSunday: false });
        }
    }
    if (daysToProcess.length === 0) { alert("Aucun jour à traiter."); return; }

    const datesForJoker = daysToProcess.filter(d => d.jokerShift !== 'R').map(d => d.dateStr);
    let selectedJoker = null;
    if (datesForJoker.length > 0) {
        const availableJokers = getAvailableJokersForDates(datesForJoker);
        if (availableJokers.length > 0) {
            const jokerList = availableJokers.map(j => `${j.code} (${j.nom} ${j.prenom})`).join('\n');
            const choice = prompt(`🤖 Jokers disponibles :\n${jokerList}\n\nEntrez le code du joker :`);
            if (choice) selectedJoker = availableJokers.find(j => j.code === choice.toUpperCase()) || null;
        } else {
            if (!confirm("⚠️ Aucun joker disponible.\nContinuer sans remplacement ?")) return;
        }
    }

    for (const day of daysToProcess) {
        const monthKey = day.dateStr.substring(0,7);
        if (!planningData[monthKey]) planningData[monthKey] = {};
        if (!planningData[monthKey][agentCode]) planningData[monthKey][agentCode] = {};
        planningData[monthKey][agentCode][day.dateStr] = {
            shift: day.agentShift,
            type: leaveType === 'period' ? 'congé_période' : 'absence',
            comment: comment + (day.isSunday ? ' (dimanche non compté)' : '')
        };
        if (selectedJoker && day.jokerShift !== 'R') {
            if (!planningData[monthKey][selectedJoker.code]) planningData[monthKey][selectedJoker.code] = {};
            planningData[monthKey][selectedJoker.code][day.dateStr] = {
                shift: day.jokerShift,
                type: 'remplacement_joker',
                replaces:agentCode,
                comment: `Remplace ${agentCode} le ${day.dateStr} - ${comment || absenceType}`
            };
        }
    }

    if (selectedJoker) {
        const startDate = daysToProcess[0].dateStr;
        const endDate = daysToProcess[daysToProcess.length-1].dateStr;
        replacementNotifications.unshift({
            id: Date.now(), date: new Date().toISOString(), agent_absent: agentCode,
            joker: selectedJoker.code, date_debut: startDate, date_fin: endDate, lu: false
        });
        saveNotifications();
        addNotification('leave_add', {
            action: 'create', agentCode, agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`,
            startDate: dates[0], endDate: dates[dates.length-1], absenceType, joker: selectedJoker ? selectedJoker.code : null, comment
        });
    }
    saveData();
    await saveSharedPlanning();  
    alert(`✅ ${absenceType === 'C' ? 'Congés' : 'Absences'} enregistrés${selectedJoker ? `\n🔄 Joker ${selectedJoker.code} remplace ${agentCode}` : ' (sans remplacement)'}`);
    await saveLeaveToCloud(agentCode, dates[0], dates[dates.length-1], absenceType, comment, selectedJoker ? selectedJoker.code : null);
// Mettre à jour congesList avec la nouvelle période
congesList.push({
    agentCode: agentCode,
    startDate: dates[0],
    endDate: dates[dates.length-1],
    type: absenceType,
    comment: comment,
    joker: selectedJoker ? selectedJoker.code : null
});
await saveSharedConges();    
    displayLeavesMenu();
}




// ==================== PARTIE 6 : STATISTIQUES ====================
function calculateAgentStats(agentCode, month, year) {
    const daysInMonth = new Date(year, month, 0).getDate();
    let travaillesNormaux = 0, feriesTravailles = 0, conges = 0, maladie = 0, autre = 0, repos = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
        const date = new Date(year, month-1, day);
        const shiftDisplay = getShiftDisplay(agentCode, dateStr);
        // Convertir en chaîne et extraire le premier caractère significatif
        let shiftStr = String(shiftDisplay || '');
        // Si la chaîne commence par une icône, prendre le caractère suivant
        let shift = shiftStr.charAt(0);
        if (shift === '🌅' || shift === '☀️' || shift === '🌙') {
            shift = shiftStr.length > 1 ? shiftStr.charAt(1) : '';
        }
        // Parfois le shift est comme "C" ou "R" ou "1", etc.
        if (shift === '1' || shift === '2' || shift === '3') {
            travaillesNormaux++;
            if (isHolidayDate(date)) feriesTravailles++;
        } else if (shift === 'C') conges++;
        else if (shift === 'M') maladie++;
        else if (shift === 'A') autre++;
        else if (shift === 'R') repos++;
    }
    const totalGeneral = travaillesNormaux + conges + feriesTravailles;
    return { travaillesNormaux, feriesTravailles, conges, maladie, autre, repos, totalGeneral };
}

function calculateWorkedStats(agentCode, startDate, endDate) {
    let travaillesNormaux = 0, feriesTravailles = 0, conges = 0, maladie = 0, autre = 0, repos = 0;
    let cur = new Date(startDate);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    while (cur <= endDateTime) {
        const dateStr = cur.toISOString().split('T')[0];
        const shift = getShiftForAgent(agentCode, dateStr);
        const isHoliday = isHolidayDate(cur);
        if (shift === '1' || shift === '2' || shift === '3') {
            travaillesNormaux++;
            if (isHoliday) feriesTravailles++;
        } else if (shift === 'C') conges++;
        else if (shift === 'M') maladie++;
        else if (shift === 'A') autre++;
        else if (shift === 'R') repos++;
        cur.setDate(cur.getDate() + 1);
    }
    const totalGeneral = travaillesNormaux + conges + feriesTravailles;
    return { travaillesNormaux, feriesTravailles, conges, maladie, autre, repos, totalGeneral };
}

function displayStatsMenu() {
    if (currentUser.role === 'CP') {
        showGroupStatsForm();
        return;
    }
    displaySubMenu("STATISTIQUES", [
        { text: "📈 Statistiques Globales", onclick: "showGlobalStats()" },
        { text: "👤 Statistiques par Agent", onclick: "showAgentStatsForm()" },
        { text: "📊 Jours Travaillés - Classement", onclick: "showWorkedDaysFormWithCustom()" },
        { text: "📋 Rapport Complet", onclick: "showFullReport()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showGlobalStats() {
    const actifs = getFilteredAgents().length;
    const jokers = agents.filter(a => a.groupe === 'J' && a.statut === 'actif').length;
    let totalTravailles = 0, totalConges = 0, totalMaladies = 0, totalAutres = 0;
    Object.keys(planningData).forEach(monthKey => {
        Object.keys(planningData[monthKey]).forEach(agentCode => {
            if (!canAccessAgent(agentCode)) return;
            Object.values(planningData[monthKey][agentCode]).forEach(rec => {
                if (rec.shift === 'C') totalConges++;
                else if (rec.shift === 'M') totalMaladies++;
                else if (rec.shift === 'A') totalAutres++;
                else if (['1','2','3'].includes(rec.shift)) totalTravailles++;
            });
        });
    });
    const totalGeneral = totalTravailles + totalConges;
    const html = `<div class="info-section"><h3>📈 Statistiques Globales</h3>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${actifs}</div><div>👥 Agents actifs</div></div>
            <div class="stat-card"><div class="stat-value">${jokers}</div><div>🃏 Jokers</div></div>
            <div class="stat-card"><div class="stat-value">${totalTravailles}</div><div>✅ Jours travaillés</div></div>
            <div class="stat-card"><div class="stat-value">${totalConges}</div><div>🏖️ Congés pris</div></div>
            <div class="stat-card"><div class="stat-value">${totalMaladies}</div><div>🤒 Maladies</div></div>
            <div class="stat-card"><div class="stat-value">${totalAutres}</div><div>📝 Autres absences</div></div>
        </div>
        <div style="margin-top:15px; background:#2c3e50; padding:10px; border-radius:8px;">
            <strong>⭐ TOTAL GÉNÉRAL (Travail + Congés) : ${totalGeneral}</strong>
        </div>
        <button class="popup-button gray" onclick="displayStatsMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showAgentStatsForm() {
    let agentsList = getFilteredAgents();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const html = `<div class="info-section"><h3>👤 Statistiques par Agent</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label>
            <input type="text" id="searchStatsAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterStatsAgentList()">
        </div>
        <div class="form-group"><label>Agent</label>
            <select id="statsAgent" size="5" class="form-input" style="height:auto">
                ${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}
            </select>
        </div>
        <div class="form-group"><label>Mois</label>
            <select id="statsMonth" class="form-input">
                ${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${MOIS_FRANCAIS[i]}</option>`).join('')}
            </select>
        </div>
        <div class="form-group"><label>Année</label>
            <input type="number" id="statsYear" class="form-input" value="${currentYear}">
        </div>
        <button class="popup-button green" onclick="showAgentStatsResult()">📊 Afficher</button>
        <button class="popup-button gray" onclick="displayStatsMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterStatsAgentList() {
    const term = document.getElementById('searchStatsAgent').value.toLowerCase();
    const select = document.getElementById('statsAgent');
    Array.from(select.options).forEach(opt => {
        opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none';
    });
}

function showAgentStatsResult() {
    const code = document.getElementById('statsAgent').value;
    const month = parseInt(document.getElementById('statsMonth').value);
    const year = parseInt(document.getElementById('statsYear').value);
    const agent = agents.find(a => a.code === code);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    if (!canAccessAgent(code)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    const stats = calculateAgentStats(code, month, year);
    const daysInMonth = new Date(year, month, 0).getDate();
    let sundays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        if (date.getDay() === 0) sundays++;
    }
    const workingDays = daysInMonth - sundays;
    const html = `<div class="info-section"><h3>📊 Statistiques de ${agent.nom} ${agent.prenom}</h3>
        <p><strong>Période:</strong> ${getMonthName(month)} ${year} (${daysInMonth} jours, ${sundays} dimanches = ${workingDays} jours ouvrés)</p>
        <table class="classement-table" style="width:100%; margin-top:15px;">
            <thead><tr style="background-color:#34495e;"><th style="padding:10px;">Type</th><th style="padding:10px;">Nombre</th><th style="padding:10px;">Inclus total ?</th></tr></thead>
            <tbody>
                <tr><td style="padding:8px;">🌅 Matin (1) + ☀️ Après-midi (2) + 🌙 Nuit (3)</td>
                    <td style="text-align:center; font-weight:bold; color:#27ae60;">${stats.travaillesNormaux}</td><td style="color:#27ae60;">✅ Oui</td></tr>
                <tr><td style="padding:8px;">🏖️ Congés (C)</td>
                    <td style="text-align:center; font-weight:bold; color:#f39c12;">${stats.conges}</td><td style="color:#27ae60;">✅ Oui</td></tr>
                <tr><td style="padding:8px;">🎉 Jours fériés travaillés</td>
                    <td style="text-align:center; font-weight:bold; color:#e67e22;">${stats.feriesTravailles}</td><td style="color:#27ae60;">✅ Oui</td></tr>
                <tr><td style="padding:8px;">🤒 Maladie (M)</td>
                    <td style="text-align:center;">${stats.maladie}</td><td style="color:#e74c3c;">❌ Non</td></tr>
                <tr><td style="padding:8px;">📝 Autre absence (A)</td>
                    <td style="text-align:center;">${stats.autre}</td><td style="color:#e74c3c;">❌ Non</td></tr>
                <tr><td style="padding:8px;">😴 Repos (R)</td>
                    <td style="text-align:center;">${stats.repos}</td><td style="color:#e74c3c;">❌ Non</td></tr>
            </tbody>
            <tfoot style="background:#2c3e50;"><tr style="border-top:2px solid #f39c12;">
                <td style="padding:10px;"><strong>⭐ TOTAL GÉNÉRAL</strong></td>
                <td style="text-align:center; font-size:1.5em; font-weight:bold; color:#f1c40f;">${stats.totalGeneral}</td>
                <td style="color:#f1c40f;">= Travail + Congés + Fériés</td>
            </tr></tfoot>
        </table>
        <button class="popup-button gray" onclick="displayStatsMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showWorkedDaysFormForCP() {
    if (!currentUser || currentUser.role !== 'CP') {
        alert("Accès réservé aux chefs de patrouille");
        return;
    }
    const group = currentUser.groupe;
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
    const html = `<div class="info-section"><h3>📊 Classement des jours travaillés - Groupe ${group}</h3>
        <div class="form-group"><label>📅 Date début</label>
            <input type="date" id="customStartDate" class="form-input" value="${firstDayOfMonth}">
        </div>
        <div class="form-group"><label>📅 Date fin</label>
            <input type="date" id="customEndDate" class="form-input" value="${lastDayOfMonth}">
        </div>
        <button class="popup-button green" onclick="showWorkedDaysResultForCP()">📊 Afficher</button>
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showWorkedDaysResultForCP() {
    if (!currentUser || currentUser.role !== 'CP') return;
    const start = new Date(document.getElementById('customStartDate').value);
    const end = new Date(document.getElementById('customEndDate').value);
    const group = currentUser.groupe;
    const agentsGroupe = agents.filter(a => a.groupe === group && a.statut === 'actif');
    if (!agentsGroupe.length) { alert("Aucun agent dans ce groupe"); return; }
    const results = agentsGroupe.map(agent => ({ agent, ...calculateWorkedStats(agent.code, start, end) }))
        .sort((a, b) => b.totalGeneral - a.totalGeneral);
    const periodName = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    let html = `<div class="info-section"><h3>📊 Classement - ${periodName} (Groupe ${group})</h3>
        <div style="overflow-x:auto;"><table class="classement-table"><thead><tr><th>Rang</th><th>Agent</th><th>✅ Travail</th><th>🏖️ Congés</th><th>🎉 Fériés</th><th>⭐ Total</th></tr></thead><tbody>`;
    results.forEach((r, i) => {
        html += `<tr><td>${i+1}</td><td>${r.agent.nom} ${r.agent.prenom}</td><td>${r.travaillesNormaux}</td><td>${r.conges}</td><td>${r.feriesTravailles}</td><td><strong>${r.totalGeneral}</strong></td></tr>`;
    });
    html += `</tbody></table></div><button class="popup-button gray" onclick="displayMainMenu()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showWorkedDaysFormWithCustom() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
    const html = `<div class="info-section"><h3>📊 Jours Travaillés - Classement</h3>
        <div class="form-group"><label>📅 Date début</label>
            <input type="date" id="customStartDate" class="form-input" value="${firstDayOfMonth}">
        </div>
        <div class="form-group"><label>📅 Date fin</label>
            <input type="date" id="customEndDate" class="form-input" value="${lastDayOfMonth}">
        </div>
        <div class="form-group"><label>👥 Groupe</label>
            <select id="workedGroup" class="form-input">
                <option value="ALL">📋 Tous les groupes</option>
                <option value="A">👥 Groupe A</option><option value="B">👥 Groupe B</option>
                <option value="C">👥 Groupe C</option><option value="D">👥 Groupe D</option>
                <option value="E">👥 Groupe E</option><option value="J">🃏 Jokers</option>
            </select>
        </div>
        <button class="popup-button green" onclick="showWorkedDaysResultWithCustom()">📊 Afficher</button>
        <button class="popup-button gray" onclick="displayStatsMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showWorkedDaysResultWithCustom() {
    const start = new Date(document.getElementById('customStartDate').value);
    const end = new Date(document.getElementById('customEndDate').value);
    const group = document.getElementById('workedGroup').value;
    if (isNaN(start) || isNaN(end)) { alert("⚠️ Sélectionnez des dates valides"); return; }
    const periodName = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    let filtered = agents.filter(a => a.statut === 'actif');
    if (group !== 'ALL') filtered = filtered.filter(a => a.groupe === group);
    if (currentUser.role === 'CP') filtered = filtered.filter(a => a.groupe === currentUser.groupe);
    const results = filtered.map(agent => ({ agent, ...calculateWorkedStats(agent.code, start, end) }))
        .sort((a, b) => b.totalGeneral - a.totalGeneral);
    const maxTotal = results[0]?.totalGeneral || 1;
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    let sundaysInPeriod = 0;
    let curDate = new Date(start);
    while (curDate <= end) { if (curDate.getDay() === 0) sundaysInPeriod++; curDate.setDate(curDate.getDate() + 1); }
    const html = `<div class="info-section"><h3>📊 Classement - ${periodName}</h3>
        <p style="font-size:0.85em; color:#f39c12;">⭐ Total = Jours travaillés + Congés + Fériés<br>📅 ${totalDays} jours, ${sundaysInPeriod} dimanches</p>
        <div style="overflow-x:auto;"><table class="classement-table"><thead><tr style="background-color:#34495e;">
            <th>Rang</th><th>Agent</th><th>Groupe</th><th>✅ Travail</th><th>🏖️ Congés</th><th>🎉 Fériés</th><th>⭐ Total</th>
        </tr></thead><tbody>
        ${results.map((r, i) => {
            const percent = Math.round((r.totalGeneral / maxTotal) * 100);
            return `<tr style="border-bottom:1px solid #34495e;"><td style="text-align:center; font-weight:bold;">${i+1}${i === 0 ? ' 👑' : ''}</td>
                <td><strong>${escapeHtml(r.agent.nom)} ${escapeHtml(r.agent.prenom)}</strong><br><small>${r.agent.code}</small></td>
                <td style="text-align:center;">${r.agent.groupe}</td>
                <td style="text-align:center; color:#27ae60;">${r.travaillesNormaux}</td>
                <td style="text-align:center; color:#f39c12;">${r.conges}</td>
                <td style="text-align:center; color:#e67e22;">${r.feriesTravailles}</td>
                <td style="text-align:center; font-weight:bold; background:#2c3e50;">${r.totalGeneral}
                    <div style="background:#34495e; border-radius:10px; height:4px; margin-top:5px;"><div style="background:#27ae60; width:${percent}%; height:4px;"></div></div>
                </td>
            </tr>`;
        }).join('')}</tbody>
        <tfoot><td colspan="3" style="text-align:right; font-weight:bold;">TOTAUX :</td>
            <td style="text-align:center; font-weight:bold;">${results.reduce((s, r) => s + r.travaillesNormaux, 0)}</td>
            <td style="text-align:center; font-weight:bold;">${results.reduce((s, r) => s + r.conges, 0)}</td>
            <td style="text-align:center; font-weight:bold;">${results.reduce((s, r) => s + r.feriesTravailles, 0)}</td>
            <td style="text-align:center; font-weight:bold; background:#f1c40f; color:#2c3e50;">${results.reduce((s, r) => s + r.totalGeneral, 0)}</td>
        </tr></tfoot>
        </table></div>
        <button class="popup-button gray" onclick="displayStatsMenu()" style="margin-top:15px;">↩️ Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showFullReport() {
    const actifs = getFilteredAgents().length;
    let totalTravailles = 0, totalConges = 0;
    let totalRadios = radios.length, totalUniforms = uniforms.length, totalWarnings = warnings.length;
    Object.keys(planningData).forEach(monthKey => {
        Object.keys(planningData[monthKey]).forEach(agentCode => {
            if (!canAccessAgent(agentCode)) return;
            Object.values(planningData[monthKey][agentCode]).forEach(rec => {
                if (rec.shift === 'C') totalConges++;
                else if (['1', '2', '3'].includes(rec.shift)) totalTravailles++;
            });
        });
    });
    const totalGeneral = totalTravailles + totalConges;
    const html = `<div class="info-section"><h3>📋 Rapport Complet</h3>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${actifs}</div><div>👥 Agents actifs</div></div>
            <div class="stat-card"><div class="stat-value">${agents.filter(a => a.groupe === 'J').length}</div><div>🃏 Jokers</div></div>
            <div class="stat-card"><div class="stat-value">${totalTravailles}</div><div>✅ Jours travaillés</div></div>
            <div class="stat-card"><div class="stat-value">${totalConges}</div><div>🏖️ Congés</div></div>
            <div class="stat-card"><div class="stat-value">${totalRadios}</div><div>📻 Radios</div></div>
            <div class="stat-card"><div class="stat-value">${totalUniforms}</div><div>👔 Agents équipés</div></div>
            <div class="stat-card"><div class="stat-value">${totalWarnings}</div><div>⚠️ Avertissements</div></div>
            <div class="stat-card"><div class="stat-value">${panicCodes.length}</div><div>🚨 Codes panique</div></div>
        </div>
        <div style="margin-top:15px; background:#2c3e50; padding:10px; border-radius:8px;">
            <strong>⭐ TOTAL GÉNÉRAL : ${totalGeneral}</strong>
        </div>
        <button class="popup-button gray" onclick="displayStatsMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

// ==================== PARTIE 7 : FILTRAGE ====================
function getFilteredAgents() {
    if (!currentUser) return [];
    // ADMIN voit TOUS les agents (actifs ou inactifs, tous groupes)
    if (currentUser.role === 'ADMIN') return agents;
    // CP voit seulement les agents actifs de son groupe
    if (currentUser.role === 'CP') {
        return agents.filter(a => a.groupe === currentUser.groupe && a.statut === 'actif');
    }
    // AGENT voit seulement son propre profil
    if (currentUser.role === 'AGENT') {
        return agents.filter(a => a.code === currentUser.agentCode);
    }
    return [];
}

function canAccessAgent(agentCode) {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'CP') {
        const agent = agents.find(a => a.code === agentCode);
        return agent && agent.groupe === currentUser.groupe;
    }
    if (currentUser.role === 'AGENT') return currentUser.agentCode === agentCode;
    return false;
}

function canAccessGroup(group) {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'CP') return currentUser.groupe === group;
    return false;
}

// ==================== PARTIE 8 : MENU PRINCIPAL ====================
function displayMainMenu() {
    const main = document.getElementById('main-content');
    document.getElementById('sub-title').textContent = "Menu Principal";
    if (!currentUser) return;
    if (currentUser.role === 'AGENT') {
        displayAgentMenu();
        return;
    }
    const actifs = getFilteredAgents().length;
    let buttons = [];
    if (currentUser.role === 'ADMIN') {
        buttons = [
            { text: "👥 GESTION DES AGENTS", onclick: "displayAgentsMenu()" },
            { text: "📅 GESTION DU PLANNING", onclick: "displayPlanningMenu()" },
            { text: "📆 GESTION SOLDES CONGÉS", onclick: "showSoldeMenu()" },
            { text: "🔄 Rafraîchir les données", onclick: "refreshAllData()", className: "menu-section" },
            { text: "📊 STATISTIQUES", onclick: "displayStatsMenu()" },
            { text: "🏖️ CONGÉS & ABSENCES", onclick: "displayLeavesMenu()" },
            { text: "🚨 CODES PANIQUE", onclick: "displayPanicMenu()" },
            { text: "📻 RADIOS", onclick: "displayRadiosMenu()" },
            { text: "👔 HABILLEMENT", onclick: "displayUniformMenu()" },
            { text: "⚠️ AVERTISSEMENTS", onclick: "displayWarningsMenu()" },
            { text: "🎉 JOURS FÉRIÉS", onclick: "displayHolidaysMenu()" },
            { text: "💾 EXPORTATIONS", onclick: "displayExportMenu()" },
            { text: "⚙️ CONFIGURATION", onclick: "displayConfigMenu()" },
            { text: "👥 GESTION UTILISATEURS", onclick: "showUsersManagement()" },
            { text: "🔑 CHANGER MOT DE PASSE", onclick: "changeMyPassword()" }
        ];
    } else if (currentUser.role === 'CP') {
        buttons = [
            { text: "📅 MON PLANNING", onclick: "viewMyPlanning()" },
            { text: "👥 PLANNING GROUPE", onclick: "showGroupPlanningForm()" },
            { text: "🔄 MODIFIER SHIFTS", onclick: "showShiftModificationForm()" },
            { text: "🏖️ GÉRER CONGÉS", onclick: "showAddLeaveForm()" },
            { text: "📆 SOLDES CONGÉS", onclick: "showSoldeMenu()" },
            { text: "🔄 ÉCHANGER SHIFTS", onclick: "showShiftExchangeForm()" },
            { text: "👔 GÉRER HABILLEMENT", onclick: "showAddUniformForm()" },
            { text: "⚠️ GÉRER AVERTISSEMENTS", onclick: "showAddWarningForm()" },
            { text: "🚨 GÉRER CODES PANIQUE", onclick: "showAddPanicForm()" },
            { text: "📻 GÉRER RADIOS", onclick: "displayRadiosMenu()" },
            { text: "🎉 JOURS FÉRIÉS", onclick: "displayHolidaysMenu()" },
            { text: "📊 STATISTIQUES GROUPE", onclick: "showGroupStatsForm()" },
            { text: "📊 JOURS TRAVAILLÉS - CLASSEMENT", onclick: "showWorkedDaysFormForCP()" },
            { text: "👤 MES INFORMATIONS", onclick: "showMyInfo()" },
            { text: "🔑 CHANGER MOT DE PASSE", onclick: "changeMyPassword()" }
        ];
    }
    main.innerHTML = `<div class="dashboard"><div class="dashboard-cards"><div class="card"><h3>👥 Agents accessibles</h3><div class="card-value">${actifs}</div></div>
        <div class="card"><h3>📋 Total agents</h3><div class="card-value">${agents.length}</div></div>
        <div class="card"><h3>📅 Planning</h3><div class="card-value">${Object.keys(planningData).length}</div></div></div>
        <div class="menu-button-container">${buttons.map(b => `<button class="menu-button ${b.className || ''}" onclick="${b.onclick}">${b.text}</button>`).join('')}
        <button class="menu-button quit-button" onclick="logout()">🚪 DÉCONNEXION</button></div></div>`;
}

async function refreshAllData() {
    showSnackbar("🔄 Synchronisation en cours...");
    await loadSharedAgents();
    await loadSharedPlanning();
    await loadSharedConges();
    await loadSharedSoldes();
    await loadSharedPanique();
    await loadSharedHabillement();
    await loadSharedAvertissements();
    showSnackbar("✅ Données mises à jour");
    window.location.reload();
}

function displaySubMenu(title, buttons) {
    const main = document.getElementById('main-content');
    document.getElementById('sub-title').textContent = title;
    main.innerHTML = `<div class="menu-button-container">${buttons.map(b => `<button class="menu-button ${b.className || ''}" onclick="${b.onclick}">${b.text}</button>`).join('')}</div>`;
}

// ==================== PARTIE 9 : FONCTIONS AGENT ====================
function displayAgentMenu() {
    const main = document.getElementById('main-content');
    document.getElementById('sub-title').textContent = "Menu Agent";
    const agent = agents.find(a => a.code === currentUser.agentCode);
    main.innerHTML = `
        <div class="dashboard">
            <div class="dashboard-cards">
                <div class="card"><h3>👤 ${agent ? agent.nom + ' ' + agent.prenom : currentUser.nom}</h3><div class="card-value">${agent ? agent.code : '-'}</div></div>
                <div class="card"><h3>👥 Groupe</h3><div class="card-value">${agent ? agent.groupe : '-'}</div></div>
            </div>
            <div class="menu-button-container">
                <button class="menu-button menu-section" onclick="viewAgentPlanning()">📅 MON PLANNING</button>
                <button class="menu-button menu-section" onclick="showAgentPersonalInfo()">👤 MES INFORMATIONS</button>
                <button class="menu-button menu-section" onclick="showAgentUniform()">👔 MON HABILLEMENT</button>
                <button class="menu-button menu-section" onclick="showAgentWarnings()">⚠️ MES AVERTISSEMENTS</button>
                <button class="menu-button menu-section" onclick="showAgentPanicCode()">🚨 MON CODE PANIQUE</button>
                <button class="menu-button menu-section" onclick="showAgentRadio()">📻 MA RADIO</button>
                <button class="menu-button menu-section" onclick="showHolidaysCalendar()">🎉 JOURS FÉRIÉS</button>
                <button class="menu-button menu-section" onclick="showSoldeMenu()">📆 MON SOLDE DE CONGÉS</button>
                <button class="menu-button menu-section" onclick="changeMyPassword()">🔑 CHANGER MOT DE PASSE</button>
                <button class="menu-button quit-button" onclick="logout()">🚪 DÉCONNEXION</button>
            </div>
        </div>
    `;
}
function viewMyPlanning() {
    if (!currentUser || currentUser.role !== 'CP') {
        alert("Accès réservé aux chefs de patrouille");
        return;
    }
    const agentCode = currentUser.agentCode;
    if (!agentCode) {
        alert("Aucun agent lié à votre compte CP");
        return;
    }
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    showAgentPlanningSimple(agentCode, currentMonth, currentYear);
}
function viewAgentPlanning() {
    const agentCode = currentUser.agentCode;
    if (!agentCode) { alert("⚠️ Code agent non trouvé"); return; }
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    showAgentPlanningSimple(agentCode, currentMonth, currentYear);
}

function showAgentPlanningSimple(agentCode, month, year) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month-1, day);
        if (isHolidayDate(date)) monthHolidays.push({ day, description: getHolidayDescription(date).description });
    }
    const stats = calculateAgentStats(agentCode, month, year);
    let rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
        const date = new Date(year, month-1, d);
        const dayName = JOURS_FRANCAIS[date.getDay()];
        const shift = getShiftForAgent(agentCode, dateStr);
        const shiftDisplay = getShiftDisplay(agentCode, dateStr);
        const color = SHIFT_COLORS[shift] || '#7f8c8d';
        const isHoliday = isHolidayDate(date);
        const holidayInfo = monthHolidays.find(h => h.day === d);
        let shiftIcon = '';
        if (shift === '1') shiftIcon = '🌅 ';
        else if (shift === '2') shiftIcon = '☀️ ';
        else if (shift === '3') shiftIcon = '🌙 ';
        else if (shift === 'R') shiftIcon = '😴 ';
        else if (shift === 'C') shiftIcon = '🏖️ ';
        else if (shift === 'M') shiftIcon = '🤒 ';
        else if (shift === 'A') shiftIcon = '📝 ';
        let holidayBadge = '';
        if (isHoliday && holidayInfo) {
            if (shift === '1' || shift === '2' || shift === '3') {
                holidayBadge = `<span style="background:#e67e22; color:white; padding:2px 6px; border-radius:10px; font-size:0.7em;">🎉 Férié travaillé: ${holidayInfo.description}</span>`;
            } else {
                holidayBadge = `<span style="background:#f39c12; color:#2c3e50; padding:2px 6px; border-radius:10px; font-size:0.7em;">🎉 ${holidayInfo.description}</span>`;
            }
        }
        rows.push(`<tr style="border-bottom:1px solid #34495e;">
            <td style="padding:8px; text-align:center; width:60px;"><strong>${d}</strong><br><span style="font-size:0.7em;">${dayName}</span></td>
            <td style="background-color:${color}; color:white; text-align:center; padding:8px; font-weight:bold;">${shiftIcon}${shiftDisplay}</th>
            <td style="padding:8px; text-align:center;">${holidayBadge || '-'}</th>
          <tr>`);
    }
    let html = `<div class="info-section">
        <h3>📅 Mon Planning - ${getMonthName(month)} ${year}</h3>
        <p><strong>${agent.nom} ${agent.prenom}</strong> (${agent.code}) - Groupe ${agent.groupe}</p>
        ${monthHolidays.length > 0 ? `<div style="background:#2c3e50; padding:10px; border-radius:8px; margin-bottom:15px;">
            <strong>📅 Jours fériés ce mois-ci :</strong>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">${monthHolidays.map(h => `<span style="background:#f39c12; color:#2c3e50; padding:3px 10px; border-radius:15px; font-size:0.8em;">🎉 ${h.day} ${getMonthName(month)}: ${h.description}</span>`).join('')}</div>
        </div>` : '<p style="color:#7f8c8d; margin-bottom:15px;">📅 Aucun jour férié ce mois-ci</p>'}
        <div style="overflow-x:auto;"><table class="planning-table" style="width:100%; border-collapse:collapse;">
            <thead><tr style="background-color:#34495e;"><th style="padding:10px;">Date</th><th style="padding:10px;">Shift</th><th style="padding:10px;">Jours fériés</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
            <tfoot style="background-color:#2c3e50;"><tr><td colspan="3" style="padding:15px;">
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:15px; text-align:center;">
                    <div style="background:#27ae60; padding:10px; border-radius:8px;">✅ Jours travaillés<br><span style="font-size:1.5em; font-weight:bold;">${stats.travaillesNormaux}</span></div>
                    <div style="background:#f39c12; padding:10px; border-radius:8px;">🏖️ Congés (C)<br><span style="font-size:1.5em; font-weight:bold;">${stats.conges}</span></div>
                    <div style="background:#e67e22; padding:10px; border-radius:8px;">🎉 Fériés travaillés<br><span style="font-size:1.5em; font-weight:bold;">${stats.feriesTravailles}</span></div>
                    <div style="background:#f1c40f; color:#2c3e50; padding:10px; border-radius:8px;">⭐ TOTAL<br><span style="font-size:1.8em; font-weight:bold;">${stats.totalGeneral}</span></div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; text-align:center; margin-top:10px; font-size:0.85em;">
                    <div>🤒 Maladie (M): ${stats.maladie} <span style="color:#e74c3c">(non compté)</span></div>
                    <div>📝 Autre absence (A): ${stats.autre} <span style="color:#e74c3c">(non compté)</span></div>
                    <div>😴 Repos (R): ${stats.repos}</div>
                </div>
            </td></tr></tfoot>
        </table></div>
        <button class="popup-button gray" onclick="displayMainMenu()" style="margin-top:15px;">↩️ Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAgentPersonalInfo() {
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const html = `<div class="info-section"><h3>👤 Mes Informations Personnelles</h3>
        <div class="info-item"><span class="info-label">📋 Code:</span> ${agent.code}</div>
        <div class="info-item"><span class="info-label">👤 Nom:</span> ${agent.nom}</div>
        <div class="info-item"><span class="info-label">👤 Prénom:</span> ${agent.prenom}</div>
        <div class="info-item"><span class="info-label">👥 Groupe:</span> ${agent.groupe}</div>
        <div class="info-item"><span class="info-label">🎫 Matricule:</span> ${agent.matricule || 'N/A'}</div>
        <div class="info-item"><span class="info-label">🆔 CIN:</span> ${agent.cin || 'N/A'}</div>
        <div class="info-item"><span class="info-label">💼 Poste:</span> ${agent.poste || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📅 Date naissance:</span> ${agent.date_naissance || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📅 Date entrée:</span> ${agent.date_entree || 'N/A'}</div>
        <div class="form-group" style="margin-top:20px;"><label>📞 Téléphone</label><input type="tel" id="editAgentTel" value="${agent.tel || ''}" class="form-input"></div>
        <div class="form-group"><label>📧 Email</label><input type="email" id="editAgentEmail" value="${agent.email || ''}" class="form-input"></div>
        <div class="form-group"><label>🏠 Adresse</label><textarea id="editAgentAdresse" class="form-input" rows="2">${agent.adresse || ''}</textarea></div>
        <button class="popup-button green" onclick="updateAgentPersonalInfo('${agent.code}')">💾 Enregistrer modifications</button>
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function updateAgentPersonalInfo(agentCode) {
    const agent = agents.find(a => a.code === agentCode);
    if (agent) {
        agent.tel = document.getElementById('editAgentTel').value;
        agent.email = document.getElementById('editAgentEmail').value;
        agent.adresse = document.getElementById('editAgentAdresse').value;
        saveData();
        alert("✅ Vos informations ont été mises à jour !");
        displayMainMenu();
    }
}

function showAgentUniform() {
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const uniform = uniforms.find(u => u.agentCode === agent.code);
    const html = `<div class="info-section"><h3>👔 Mon Habillement</h3>
        ${uniform ? `
            <div class="info-item"><span class="info-label">📅 Date de fourniture:</span> ${uniform.date}</div>
            <div class="info-item"><span class="info-label">👕 Articles fournis:</span> 
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">${uniform.articles ? uniform.articles.map(a => `<span style="background:#2c3e50; padding:4px 12px; border-radius:20px;">${a}</span>`).join('') : '-'}</div>
            </div>
            <div class="info-item"><span class="info-label">💬 Commentaire:</span> ${uniform.comment || '-'}</div>
        ` : '<p style="text-align:center; padding:20px;">Aucun enregistrement d\'habillement trouvé.</p>'}
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAgentWarnings() {
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const agentWarnings = warnings.filter(w => w.agent_code === agent.code);
    const html = `<div class="info-section"><h3>⚠️ Mes Avertissements</h3>
        ${agentWarnings.length ? `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Date</th><th>Type</th><th>Description</th><th>Statut</th></tr></thead>
        <tbody>${agentWarnings.map(w => `<tr><td>${w.date}</td><td><span class="status-badge ${w.type === 'ORAL' ? 'active' : 'inactive'}">${w.type}</span></td><td>${w.description}</td><td>${w.status === 'active' ? '🟢 Actif' : '🔵 Archivé'}</td></tr>`).join('')}</tbody></table>` : '<p style="text-align:center; padding:20px;">Aucun avertissement.</p>'}
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAgentPanicCode() {
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const panic = panicCodes.find(p => p.agent_code === agent.code);
    const html = `<div class="info-section"><h3>🚨 Mon Code Panique</h3>
        ${panic ? `<div style="text-align:center; padding:20px;"><div style="font-size:0.9rem; color:#bdc3c7;">Votre code d'urgence :</div>
        <div style="font-size:3rem; font-weight:bold; color:#e74c3c; letter-spacing:5px; margin:10px 0; background:#2c3e50; padding:15px; border-radius:10px;">${panic.code}</div>
        <div class="info-item"><span class="info-label">📍 Poste/Secteur:</span> ${panic.poste || '-'}</div>
        <div class="info-item"><span class="info-label">💬 Commentaire:</span> ${panic.comment || '-'}</div></div>` : '<p style="text-align:center; padding:20px;">Aucun code panique enregistré.</p>'}
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAgentRadio() {
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    const radio = radios.find(r => r.attributed_to === agent.code);
    const html = `<div class="info-section"><h3>📻 Ma Radio</h3>
        ${radio ? `<div style="text-align:center; padding:20px;"><div style="font-size:3rem;">📻</div>
        <div class="info-item"><span class="info-label">🆔 ID:</span> <strong>${radio.id}</strong></div>
        <div class="info-item"><span class="info-label">📟 Modèle:</span> ${radio.model}</div>
        <div class="info-item"><span class="info-label">🔢 Série:</span> ${radio.serial || '-'}</div>
        <div class="info-item"><span class="info-label">📅 Date attribution:</span> ${radio.attribution_date || '-'}</div>
        <div class="info-item"><span class="info-label">💰 Valeur:</span> ${radio.price ? radio.price + ' DH' : '-'}</div>
        <div style="margin-top:15px; background:#2c3e50; padding:10px; border-radius:8px;">⚠️ En cas de perte ou casse, veuillez contacter votre administrateur immédiatement.</div></div>` : '<p style="text-align:center; padding:20px;">Aucune radio attribuée.</p>'}
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showHolidaysCalendar() {
    const year = new Date().getFullYear();
    let html = `<div class="info-section"><h3>📅 Calendrier des Jours Fériés ${year}</h3>
        <div class="form-group"><label>Année</label><input type="number" id="calendarYear" class="form-input" value="${year}" onchange="refreshCalendarAgent()"></div>
        <div id="calendarContainerAgent">${generateCalendarHTMLAgent(year)}</div>
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function refreshCalendarAgent() {
    const year = parseInt(document.getElementById('calendarYear').value);
    document.getElementById('calendarContainerAgent').innerHTML = generateCalendarHTMLAgent(year);
}

function generateCalendarHTMLAgent(year) {
    let html = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:15px;">';
    for (let month = 1; month <= 12; month++) {
        const firstDay = new Date(year, month - 1, 1);
        const daysInMonth = new Date(year, month, 0).getDate();
        const startWeekday = firstDay.getDay();
        const monthHolidays = holidays.filter(h => parseInt(h.date.split('-')[0]) === month);
        html += `<div style="background:#34495e; border-radius:8px; padding:10px;">
            <h4 style="margin:0 0 10px 0; text-align:center; background:#2c3e50; padding:5px; border-radius:5px;">${MOIS_FRANCAIS[month-1]}</h4>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:3px; font-size:0.7em; text-align:center;">
                <div style="color:#e74c3c;">Dim</div><div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div style="color:#e74c3c;">Sam</div>`;
        for (let i = 0; i < startWeekday; i++) html += '<div style="opacity:0.3;">-</div>';
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = monthHolidays.some(h => parseInt(h.date.split('-')[1]) === day);
            const holidayInfo = monthHolidays.find(h => parseInt(h.date.split('-')[1]) === day);
            let dayStyle = isHoliday ? 'background:#f39c12; color:#2c3e50; font-weight:bold;' : (isWeekend ? 'background:#e74c3c; color:white;' : 'background:#2c3e50;');
            html += `<div style="${dayStyle} padding:5px; border-radius:3px;" title="${holidayInfo ? holidayInfo.description : ''}">${isHoliday ? '🎉' : ''}${day}</div>`;
        }
        html += `</div>`;
        if (monthHolidays.length > 0) html += `<div style="margin-top:8px; font-size:0.65em; color:#f39c12;">${monthHolidays.map(h => `📅 ${h.date.split('-')[1]}: ${h.description}`).join(' | ')}</div>`;
        html += `</div>`;
    }
    html += '</div>';
    return html;
}

// ==================== PARTIE 10 : NOTIFICATIONS ====================
function loadNotifications() {
    const saved = localStorage.getItem('sga_sys_notifications');
    notifications = saved ? JSON.parse(saved) : [];
}

function saveNotifications() {
    localStorage.setItem('sga_sys_notifications', JSON.stringify(notifications));
}

function addNotification(type, details) {
    if (!currentUser) return;
    const notification = {
        id: Date.now(), type, action: details.action || 'create',
        createdBy: currentUser.username, createdByName: `${currentUser.nom} ${currentUser.prenom}`,
        createdByRole: currentUser.role, createdAt: new Date().toISOString(),
        details, readBy: []
    };
    notifications.unshift(notification);
    if (notifications.length > 100) notifications = notifications.slice(0, 100);
    saveNotifications();
    updateNotificationBadge();
    showNotificationToast(type, details);
}

function showNotificationToast(type, details) {
    let message = '';
    switch(type) {
        case 'shift_modification':
            message = `✏️ Shift modifié : ${details.agentName} le ${details.date} (${details.oldValue} → ${details.newValue})`;
            break;
        case 'leave_add':
            message = `🏖️ Congé ajouté : ${details.agentName} du ${details.startDate} au ${details.endDate}`;
            break;
        case 'leave_delete':
            message = `🗑️ Congé supprimé : ${details.agentName} (${details.startDate} → ${details.endDate})`;
            break;
        case 'shift_exchange':
            message = `🔄 Échange de shifts : ${details.agent1Name} ↔ ${details.agent2Name}`;
            break;
        case 'agent_add':
            message = `➕ Nouvel agent : ${details.agentName}`;
            break;
        case 'agent_update':
            message = `✏️ Agent modifié : ${details.agentName} (${details.field})`;
            break;
        case 'agent_delete':
            message = `🗑️ Agent supprimé : ${details.agentName}`;
            break;
        case 'panic_add':
            message = `🚨 Code panique ${details.code} attribué à ${details.agentName}`;
            break;
        case 'uniform_add':
            message = `👔 Habillement enregistré pour ${details.agentName} : ${details.articles}`;
            break;
        case 'warning_add':
            message = `⚠️ Avertissement (${details.warningType}) pour ${details.agentName}`;
            break;
        default:
            message = `🔔 Nouvelle notification`;
    }
    
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; bottom:20px; right:20px; background:#34495e; color:white; padding:10px 16px; border-radius:8px; border-left:4px solid #f39c12; z-index:10000; cursor:pointer; font-size:0.85rem; box-shadow:0 2px 5px rgba(0,0,0,0.3);`;
    toast.innerHTML = `<span>🔔</span> ${message}`;
    toast.onclick = () => { toast.remove(); showNotificationsPanel(); };
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
function showNotificationsPanel() {
    if (!currentUser) return;
    
    // Filtrer selon le rôle
    let filteredNotifs = notifications.slice();
    if (currentUser.role === 'AGENT') {
        const myCode = currentUser.agentCode;
        filteredNotifs = notifications.filter(n => {
            const d = n.details;
            // Vérifier tous les champs possibles contenant un code agent
            return d.agentCode === myCode || 
                   d.agent1Code === myCode || 
                   d.agent2Code === myCode ||
                   d.agentCode === myCode;
        });
    }
    
    const unreadCount = filteredNotifs.filter(n => !n.readBy.includes(currentUser.username)).length;
    
    const panel = document.createElement('div');
    panel.id = 'notificationsPanel';
    panel.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:10001;';
    
    let html = `<div style="background:#2c3e50; border-radius:10px; width:500px; max-width:90%; max-height:80vh; overflow:hidden; display:flex; flex-direction:column;">
        <div style="padding:15px; border-bottom:1px solid #34495e; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <h3 style="margin:0;">🔔 Notifications</h3>
            <div style="display:flex; gap:8px;">
                <span style="background:#e74c3c; padding:4px 10px; border-radius:20px;">${unreadCount} non lue(s)</span>
                <button id="clearAllNotif" style="background:#e74c3c; border:none; padding:5px 12px; border-radius:5px; color:white; cursor:pointer;">🗑️ Tout supprimer</button>
                <button id="closeNotifPanel" style="background:#7f8c8d; border:none; padding:5px 12px; border-radius:5px; color:white; cursor:pointer;">✖️ Fermer</button>
            </div>
        </div>
        <div style="overflow-y:auto; padding:15px;">`;
    
    if (filteredNotifs.length === 0) {
        html += '<div style="text-align:center; padding:40px;">📭 Aucune notification</div>';
    } else {
        filteredNotifs.slice().reverse().forEach(n => {
            const isUnread = !n.readBy.includes(currentUser.username);
            const date = new Date(n.createdAt).toLocaleString();
            let detailsText = '';
            switch(n.type) {
                case 'shift_modification':
                    detailsText = `✏️ Shift modifié : ${n.details.agentName} le ${n.details.date} (${n.details.oldValue} → ${n.details.newValue})`;
                    break;
                case 'leave_add':
                    detailsText = `🏖️ Congé ajouté : ${n.details.agentName} du ${n.details.startDate} au ${n.details.endDate}`;
                    break;
                case 'leave_delete':
                    detailsText = `🗑️ Congé supprimé : ${n.details.agentName} (${n.details.startDate} → ${n.details.endDate})`;
                    break;
                case 'shift_exchange':
                    detailsText = `🔄 Échange de shifts : ${n.details.agent1Name} ↔ ${n.details.agent2Name}`;
                    break;
                case 'agent_add':
                    detailsText = `➕ Nouvel agent : ${n.details.agentName}`;
                    break;
                case 'agent_update':
                    detailsText = `✏️ Agent modifié : ${n.details.agentName} (${n.details.field})`;
                    break;
                case 'agent_delete':
                    detailsText = `🗑️ Agent supprimé : ${n.details.agentName}`;
                    break;
                case 'panic_add':
                    detailsText = `🚨 Code panique ${n.details.code} attribué à ${n.details.agentName}`;
                    break;
                case 'uniform_add':
                    detailsText = `👔 Habillement enregistré pour ${n.details.agentName} : ${n.details.articles}`;
                    break;
                case 'warning_add':
                    detailsText = `⚠️ Avertissement (${n.details.warningType}) pour ${n.details.agentName}`;
                    break;
                default:
                    detailsText = JSON.stringify(n.details);
            }
            html += `<div style="background:#34495e; border-radius:8px; padding:12px; margin-bottom:10px; ${isUnread ? 'border-left:3px solid #e74c3c;' : 'border-left:3px solid #2ecc71;'}">
                <div><strong>${n.type.replace('_', ' ')}</strong> - ${date}</div>
                <div>Par: ${n.createdByName} (${n.createdByRole})</div>
                <div>${detailsText}</div>`;
            if (isUnread) {
                html += `<button class="mark-read-btn" data-id="${n.id}" style="background:#27ae60; border:none; padding:5px 12px; border-radius:5px; color:white; margin-top:8px;">✓ Marquer lu</button>`;
            } else {
                html += `<span style="font-size:0.7rem; color:#27ae60;">✓ Lu</span>`;
            }
            html += `</div>`;
        });
    }
    html += `</div></div>`;
    panel.innerHTML = html;
    document.body.appendChild(panel);
    
    document.getElementById('closeNotifPanel').onclick = () => panel.remove();
    document.getElementById('clearAllNotif').onclick = () => clearAllNotifications(panel);
    
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseInt(btn.dataset.id);
            const notif = notifications.find(n => n.id === id);
            if (notif && !notif.readBy.includes(currentUser.username)) {
                notif.readBy.push(currentUser.username);
                saveNotifications();
                updateNotificationBadge();
                panel.remove();
                showNotificationsPanel();
            }
        };
    });
}

function clearAllNotifications(panel = null) {
    if (!checkPassword("Suppression de toutes les notifications")) return;
    if (confirm("⚠️ Supprimer définitivement TOUTES les notifications ?\nCette action est irréversible.")) {
        notifications = [];
        saveNotifications();
        updateNotificationBadge();
        if (panel) panel.remove();
        showNotificationsPanel(); // rafraîchit l'affichage
    }
}

function attachNotificationClick() {
    const icon = document.getElementById('notificationIcon');
    if (icon) { icon.onclick = (e) => { e.stopPropagation(); showNotificationsPanel(); }; return true; }
    return false;
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge && currentUser) {
        const count = notifications.filter(n => !n.readBy.includes(currentUser.username)).length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// ==================== PARTIE 11 : SOLDES DE CONGÉS (version unifiée) ====================
function getDroitAnnuelPourAnnee(agent, annee) {
    if (!agent || !agent.date_entree) return 18;
    const dateEntree = new Date(agent.date_entree);
    const anneeEntree = dateEntree.getFullYear();
    if (annee < anneeEntree) return 0;

    // Calcul de l'ancienneté (en années) au 1er janvier de l'année considérée
    const premierJanvier = new Date(annee, 0, 1);
    let ancienneteAnnees = (premierJanvier - dateEntree) / (365.25 * 24 * 3600 * 1000);
    if (ancienneteAnnees < 0) ancienneteAnnees = 0;

    // Détermination du droit annuel complet selon l'ancienneté
    let droitComplet = 18;
    if (ancienneteAnnees >= 0.5 && ancienneteAnnees < 5) droitComplet = 18;
    else if (ancienneteAnnees >= 5 && ancienneteAnnees < 10) droitComplet = 19.5;
    else if (ancienneteAnnees >= 10 && ancienneteAnnees < 15) droitComplet = 21;
    else if (ancienneteAnnees >= 15 && ancienneteAnnees < 20) droitComplet = 22.5;
    // au-delà de 20 ans, on peut continuer avec 22.5 ou définir plus

    const anneeActuelle = new Date().getFullYear();
    // Année d'embauche : prorata à partir du mois d'entrée (inclus)
    if (annee === anneeEntree) {
        const moisEntree = dateEntree.getMonth() + 1;
        const moisRestants = 13 - moisEntree;
        const prorata = droitComplet * moisRestants / 12;
        return Math.round(prorata * 2) / 2;
    }
    // Année en cours : prorata sur les mois écoulés (si on calcule au fil de l’eau)
    else if (annee === anneeActuelle) {
        const moisActuel = new Date().getMonth() + 1;
        const prorata = droitComplet * moisActuel / 12;
        return Math.round(prorata * 2) / 2;
    }
    // Autres années pleines
    else {
        return droitComplet;
    }
}

function getJoursPrisDansAnnee(agentCode, annee) {
    let total = 0;
    for (let mois = 1; mois <= 12; mois++) {
        const daysInMonth = new Date(annee, mois, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${annee}-${mois.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
            if (getShiftForAgent(agentCode, dateStr) === 'C') total++;
        }
    }
    return total;
}

function recalculerSoldesAgent(agentCode) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent || !agent.date_entree) return;
    const anneeEntree = new Date(agent.date_entree).getFullYear();
    const anneeActuelle = new Date().getFullYear();
    let reportPrecedent = 0;
    for (let annee = anneeEntree; annee <= anneeActuelle; annee++) {
        const droit = getDroitAnnuelPourAnnee(agent, annee); // ← utilise la nouvelle fonction
        let pris = 0;
        for (let mois = 1; mois <= 12; mois++) {
            const daysInMonth = new Date(annee, mois, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${annee}-${mois.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
                if (getShiftForAgent(agentCode, dateStr) === 'C') pris++;
            }
        }
        let existant = soldesConges.find(s => s.agentCode === agentCode && s.annee === annee);
        const totalDispo = droit + reportPrecedent;
        const reste = Math.max(0, totalDispo - pris);
        if (!existant) {
            soldesConges.push({ agentCode, annee, droitAnnuel: droit, reportAnt: reportPrecedent, totalDispo, pris, reste });
        } else {
            existant.droitAnnuel = droit;
            existant.reportAnt = reportPrecedent;
            existant.totalDispo = totalDispo;
            existant.pris = pris;
            existant.reste = reste;
        }
        reportPrecedent = reste;
    }
    saveData();
}


async function setPrisManuel(agentCode, annee, nouvelleValeur) {
    if (!currentUser || currentUser.role !== 'ADMIN') {
        alert("⚠️ Action réservée à l'administrateur");
        return;
    }
    let pris = parseFloat(nouvelleValeur);
    if (isNaN(pris)) pris = 0;
    let existant = soldesConges.find(s => s.agentCode === agentCode && s.annee === annee);
    if (existant) existant.pris = pris;
    else recalculerSoldesAgent(agentCode);
    const agent = agents.find(a => a.code === agentCode);
    if (!agent) return;
    const anneeEntree = new Date(agent.date_entree).getFullYear();
    const anneeActuelle = new Date().getFullYear();
    let reportPrecedent = 0;
    for (let y = anneeEntree; y <= anneeActuelle; y++) {
        let s = soldesConges.find(s => s.agentCode === agentCode && s.annee === y);
        if (!s) continue;
        const droit = getDroitAnnuelPourAnnee(agent, y);
        const totalDispo = droit + reportPrecedent;
        const reste = Math.max(0, totalDispo - s.pris);
        s.droitAnnuel = droit;
        s.reportAnt = reportPrecedent;
        s.totalDispo = totalDispo;
        s.reste = reste;
        reportPrecedent = reste;
    }
    saveData();
    await saveSharedSoldes();
}
function afficherSoldesAgent(agentCode, anneeParam = null) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent || !canAccessAgent(agentCode)) { alert("Accès non autorisé ou agent introuvable"); return; }
    recalculerSoldesAgent(agentCode);
    let annees = [...new Set(soldesConges.filter(s => s.agentCode === agentCode).map(s => s.annee))].sort();
    if (anneeParam) annees = annees.filter(a => a == anneeParam);
    let rows = '', totalDroits = 0, totalReports = 0, totalDispo = 0, totalPris = 0, totalRestes = 0;
    
    const isAdmin = (currentUser && currentUser.role === 'ADMIN');
    const isAgent = (currentUser && currentUser.role === 'AGENT');
    const retourOnclick = isAgent ? 'displayAgentMenu()' : 'showSoldeMenu()';

    for (const annee of annees) {
        const solde = soldesConges.find(s => s.agentCode === agentCode && s.annee === annee);
        if (!solde) continue;
        totalDroits += solde.droitAnnuel;
        totalReports += solde.reportAnt;
        totalDispo += solde.totalDispo;
        totalPris += solde.pris;
        totalRestes += solde.reste;
        
        rows += `<tr>
            <td style="text-align:center;">${annee}</td>
            <td style="text-align:center;">${solde.droitAnnuel.toFixed(2)}</th>
            <td style="text-align:center;">${solde.reportAnt.toFixed(2)}</th>
            <td style="text-align:center;">${solde.totalDispo.toFixed(2)}</th>
            <td style="text-align:center;">
                ${isAdmin 
                    ? `<input type="number" step="0.5" value="${solde.pris}" style="width:80px;" onchange="setPrisManuel('${agentCode}', ${annee}, this.value)">`
                    : `<span>${solde.pris}</span>`
                }
            </th>
            <td style="text-align:center; font-weight:bold; color:#f39c12;">${solde.reste.toFixed(2)}</th>
            <td style="text-align:center;">
                ${isAdmin 
                    ? `<button class="action-btn small blue" onclick="afficherDetailMensuelConges('${agentCode}', ${annee})">📅 Détail</button>`
                    : ''
                }
            </th>
        </tr>`;
    }
    
    const html = `<div class="info-section"><h3>📆 Solde des congés - ${agent.nom} ${agent.prenom} (${agent.code})</h3>
        <div style="overflow-x:auto;"><table class="classement-table"><thead>
            <tr><th>Année</th><th>Droit annuel</th><th>Report ant.</th><th>Total dispo</th><th>Pris</th><th>Reste</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
            <tr><td><strong>Total</strong></th><td><strong>${totalDroits.toFixed(2)}</strong></th>
            <td><strong>${totalReports.toFixed(2)}</strong></th><td><strong>${totalDispo.toFixed(2)}</strong></th>
            <td><strong>${totalPris.toFixed(2)}</strong></th><td><strong style="color:#f1c40f;">${totalRestes.toFixed(2)}</strong></th><td></th>
        </tr></tfoot>
        </table></div>
        <button class="popup-button gray" onclick="${retourOnclick}">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function afficherDetailMensuelConges(agentCode, annee) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent) return;
    let rows = '', total = 0;
    const isAdmin = (currentUser && currentUser.role === 'ADMIN');
    
    for (let mois = 1; mois <= 12; mois++) {
        const jours = [];
        const daysInMonth = new Date(annee, mois, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${annee}-${mois.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
            if (getShiftForAgent(agentCode, dateStr) === 'C') { jours.push(d); total++; }
        }
        rows += `<tr>
            <td>${MOIS_FRANCAIS[mois-1]}</th>
            <td>${jours.length ? jours.join(', ') : 'Aucun'}</th>
            <td>
                ${isAdmin 
                    ? `<button class="action-btn small green" onclick="ajouterJourConge('${agentCode}', ${annee}, ${mois})">➕</button>
                       <button class="action-btn small red" onclick="supprimerUnJourConge('${agentCode}', ${annee}, ${mois})">🗑️</button>`
                    : ''
                }
            </th>
        </tr>`;
    }
    
    const html = `<div class="info-section"><h3>📅 Détail mensuel - ${agent.nom} ${agent.prenom} (${annee})</h3>
        <p><strong>Total congés :</strong> ${total}</p>
        <table class="classement-table"><thead><tr><th>Mois</th><th>Dates (C)</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <button class="popup-button gray" onclick="afficherSoldesAgent('${agentCode}')">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function ajouterJourConge(agentCode, annee, mois) {
    if (!currentUser || currentUser.role !== 'ADMIN') {
        alert("⚠️ Action réservée à l'administrateur");
        return;
    }
    const jour = prompt(`Jour (1-${new Date(annee, mois, 0).getDate()}) :`);
    if (!jour) return;
    const j = parseInt(jour);
    if (isNaN(j)) return;
    const dateStr = `${annee}-${mois.toString().padStart(2,'0')}-${j.toString().padStart(2,'0')}`;
    const monthKey = dateStr.substring(0,7);
    if (!planningData[monthKey]) planningData[monthKey] = {};
    if (!planningData[monthKey][agentCode]) planningData[monthKey][agentCode] = {};
    planningData[monthKey][agentCode][dateStr] = { shift: 'C', type: 'congé', comment: 'Ajout manuel' };
    saveData();
    recalculerSoldesAgent(agentCode);
    afficherDetailMensuelConges(agentCode, annee);
}

function supprimerUnJourConge(agentCode, annee, mois) {
    if (!currentUser || currentUser.role !== 'ADMIN') {
        alert("⚠️ Action réservée à l'administrateur");
        return;
    }
    const jour = prompt(`Jour à supprimer (1-${new Date(annee, mois, 0).getDate()}) :`);
    if (!jour) return;
    const j = parseInt(jour);
    if (isNaN(j)) return;
    const dateStr = `${annee}-${mois.toString().padStart(2,'0')}-${j.toString().padStart(2,'0')}`;
    const monthKey = dateStr.substring(0,7);
    if (planningData[monthKey]?.[agentCode]?.[dateStr]?.shift === 'C') {
        delete planningData[monthKey][agentCode][dateStr];
        saveData();
        recalculerSoldesAgent(agentCode);
        afficherDetailMensuelConges(agentCode, annee);
    } else alert("Ce jour n'est pas un congé.");
}
function showSoldeMenu() {
    if (currentUser.role === 'AGENT') {
        const agent = agents.find(a => a.code === currentUser.agentCode);
        if (agent) afficherSoldesAgent(agent.code);
        else alert("Agent non trouvé");
        return;
    }
    let buttons = [
        { text: "👤 Par agent", onclick: "showSoldeAgentForm()" },
        { text: "📊 Par groupe", onclick: "showSoldeGroupeForm()" },
        { text: "📈 Statistiques globales", onclick: "showSoldeStats()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ];
    displaySubMenu("📆 GESTION SOLDES CONGÉS", buttons);
}

function showSoldeAgentForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>👤 Soldes de congés par agent</h3>
        <div class="form-group"><label>🔍 Rechercher</label><input type="text" id="searchSoldeAgent" onkeyup="filterSoldeAgentList()"></div>
        <select id="soldeAgentSelect" size="5" class="form-input">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select>
        <button class="popup-button green" onclick="afficherSoldesAgent(document.getElementById('soldeAgentSelect').value)">Afficher</button>
        <button class="popup-button gray" onclick="showSoldeMenu()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterSoldeAgentList() {
    const term = document.getElementById('searchSoldeAgent')?.value.toLowerCase() || '';
    const select = document.getElementById('soldeAgentSelect');
    if (select) Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

function showSoldeGroupeForm() {
    let groupes = ['A','B','C','D','E','J'];
    if (currentUser.role === 'CP') groupes = [currentUser.groupe];
    const html = `<div class="info-section"><h3>📊 Soldes par groupe</h3><select id="groupeSoldeSelect">${groupes.map(g => `<option value="${g}">Groupe ${g}</option>`).join('')}</select>
        <button class="popup-button green" onclick="afficherSoldesGroupe()">Afficher</button><button class="popup-button gray" onclick="showSoldeMenu()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function afficherSoldesGroupe() {
    const groupe = document.getElementById('groupeSoldeSelect').value;
    const agentsGroupe = agents.filter(a => a.groupe === groupe && a.statut === 'actif');
    if (!agentsGroupe.length) { alert("Aucun agent"); return; }
    agentsGroupe.forEach(a => recalculerSoldesAgent(a.code));
    let html = `<h3>Soldes Groupe ${groupe}</h3><table class="classement-table"><thead><tr><th>Agent</th><th>Dernière année</th><th>Reste (jours)</th></tr></thead><tbody>`;
    for (const agent of agentsGroupe) {
        const dernier = soldesConges.filter(s => s.agentCode === agent.code).sort((a,b) => b.annee - a.annee)[0];
        if (dernier) html += `<tr><td>${agent.code} - ${agent.nom} ${agent.prenom}</td><td>${dernier.annee}</td><td>${dernier.reste}</td></tr>`;
    }
    html += `</tbody></table><button class="popup-button gray" onclick="showSoldeMenu()">Retour</button>`;
    document.getElementById('main-content').innerHTML = html;
}

function showSoldeStats() {
    const agentsActifs = getFilteredAgents();
    agentsActifs.forEach(a => recalculerSoldesAgent(a.code));
    let totalDroits = 0, totalRestes = 0;
    for (const agent of agentsActifs) {
        const dernier = soldesConges.filter(s => s.agentCode === agent.code).sort((a,b) => b.annee - a.annee)[0];
        if (dernier) { totalDroits += dernier.droitAnnuel; totalRestes += dernier.reste; }
    }
    const html = `<div class="info-section"><h3>📈 Statistiques globales</h3><div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${agentsActifs.length}</div><div>Agents actifs</div></div>
        <div class="stat-card"><div class="stat-value">${totalDroits.toFixed(1)}</div><div>Droits totaux</div></div>
        <div class="stat-card"><div class="stat-value">${totalRestes.toFixed(1)}</div><div>Jours restants</div></div>
    </div><button class="popup-button gray" onclick="showSoldeMenu()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

// ==================== PARTIE 12 : GESTION DES AGENTS (extrait mi====================

function displayAgentsMenu() {
    if (currentUser.role === 'CP') {
        displaySubMenu("GESTION DES AGENTS", [
            { text: "📋 Liste des Agents", onclick: "showAgentsList()" },
            { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
        ]);
        return;
    }
    
    if (currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayMainMenu();
        return;
    }
    
    displaySubMenu("GESTION DES AGENTS", [
        { text: "📋 Liste des Agents", onclick: "showAgentsList()" },
        { text: "📥 Importer Agents (CSV)", onclick: "showImportCSVForm()" },
        { text: "📤 Exporter Agents", onclick: "exportAgentsCSV()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}
function showAgentsList() {
    // Nettoyer les doublons
    const unique = [];
    const codes = new Set();
    for (const a of agents) {
        if (!codes.has(a.code)) {
            codes.add(a.code);
            unique.push(a);
        }
    }
    agents = unique;
    localStorage.setItem('sga_agents', JSON.stringify(agents));

    // Filtrer selon le rôle
    let filteredAgents = getFilteredAgents();
    const groupLabel = currentUser.role === 'CP' ? ` - Groupe ${currentUser.groupe} uniquement` : '';

    // Remplacer TOUT le contenu de main-content par une version ultra-simple
    const mainContent = document.getElementById('main-content');
    
    let html = `<div class="info-section">
        <h3>📋 Liste des Agents (${filteredAgents.length})${groupLabel}</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
            <input type="text" id="searchAgent" placeholder="🔍 Rechercher..." style="flex:1; padding:10px;" onkeyup="filterAgentsList()">
            <select id="filterGroup" onchange="filterAgentsList()" style="padding:10px;">
                <option value="ALL">Tous groupes</option><option value="A">A</option><option value="B">B</option>
                <option value="C">C</option><option value="D">D</option><option value="E">E</option><option value="J">Jokers</option>
            </select>
            <select id="filterStatus" onchange="filterAgentsList()" style="padding:10px;">
                <option value="ALL">Tous statuts</option>
                <option value="actif">Actifs</option><option value="inactif">Inactifs</option>
            </select>
        </div>
        <div id="agentsListContainer" style="background:#2c3e50; padding:10px; border:2px solid #f39c12;"></div>`;
    
    if (currentUser.role === 'ADMIN') {
        html += `<div style="margin-top:15px; text-align:center;"><button class="popup-button green" onclick="showAddAgentForm()">➕ Ajouter un agent</button></div>`;
    }
    html += `<button class="popup-button gray" onclick="displayAgentsMenu()" style="margin-top:15px;">Retour</button></div>`;
    
    mainContent.innerHTML = html;
    
    // Remplir le tableau
    const container = document.getElementById('agentsListContainer');
    if (container) {
        // Générer un tableau HTML simple
      let tableHtml = '<div style="overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch;">';
tableHtml += '<table style="width:100%; border-collapse:collapse; background:#34495e; color:white;">';

        tableHtml += '<thead><tr style="background:#2c3e50;"><th style="padding:8px;">Code</th><th style="padding:8px;">Nom</th><th style="padding:8px;">Prénom</th><th style="padding:8px;">Groupe</th><th style="padding:8px;">Tél</th><th style="padding:8px;">Statut</th><th style="padding:8px;">Actions</th></tr></thead><tbody>';
        
        for (let i = 0; i < filteredAgents.length; i++) {
            const a = filteredAgents[i];
            tableHtml += `<tr style="border-bottom:1px solid #2c3e50;">
                <td style="padding:8px;">${a.code}</td>
                <td style="padding:8px;">${a.nom}</td>
                <td style="padding:8px;">${a.prenom}</td>
                <td style="padding:8px;">${a.groupe}</td>
                <td style="padding:8px;">${a.tel || '-'}</td>
                <td style="padding:8px;"><span style="background:${a.statut === 'actif' ? 'green' : 'red'}; padding:2px 8px; border-radius:12px;">${a.statut === 'actif' ? 'Actif' : 'Inactif'}</span></td>
                <td style="padding:8px;">
                    <button onclick="showEditAgent('${a.code}')" style="background:#3498db; border:none; padding:4px 8px; color:white;">✏️</button>
                    <button onclick="deleteAgent('${a.code}')" style="background:#e74c3c; border:none; padding:4px 8px; color:white;">🗑️</button>
                    <button onclick="showAgentDetails('${a.code}')" style="background:#f39c12; border:none; padding:4px 8px; color:white;">👁️</button>
                </td>
            </tr>`;
        }
        tableHtml += '</tbody></table></div>';
        container.innerHTML = tableHtml;
        
        // DEBUG : alerte pour confirmer
      // alert("Tableau généré pour " + filteredAgents.length + " agents");
    }
}
function generateAgentsTable(agentsList) {
    if (!agentsList || agentsList.length === 0) {
        return '<p style="text-align:center; padding:20px;">Aucun agent trouvé</p>';
    }
    
    let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; background:#34495e; color:white; font-size:0.85rem;">';
    html += '<thead><tr style="background:#2c3e50;"><th style="padding:6px 5px;">Code</th><th style="padding:6px 5px;">Nom</th><th style="padding:6px 5px;">Prénom</th><th style="padding:6px 5px;">Groupe</th><th style="padding:6px 5px;">Tél</th><th style="padding:6px 5px;">Statut</th><th style="padding:6px 5px;">Actions</th></tr></thead><tbody>';
    
    for (let i = 0; i < agentsList.length; i++) {
        const a = agentsList[i];
        html += `<tr style="border-bottom:1px solid #2c3e50;">
            <td style="padding:4px 5px;">${escapeHtml(a.code)}</th>
            <td style="padding:4px 5px;">${escapeHtml(a.nom)}</th>
            <td style="padding:4px 5px;">${escapeHtml(a.prenom)}</th>
            <td style="padding:4px 5px;">${a.groupe || '-'}</th>
            <td style="padding:4px 5px;">${a.tel || '-'}</th>
            <td style="padding:4px 5px;"><span style="background:${a.statut === 'actif' ? '#27ae60' : '#e74c3c'}; padding:2px 6px; border-radius:12px; font-size:0.75rem;">${a.statut === 'actif' ? 'Actif' : 'Inactif'}</span></th>
            <td style="padding:4px 5px; white-space:nowrap;">
                <button onclick="showEditAgent('${a.code}')" style="background:#3498db; border:none; padding:2px 6px; color:white; border-radius:3px; cursor:pointer; font-size:0.7rem; margin:0 1px;">✏️</button>
                <button onclick="deleteAgent('${a.code}')" style="background:#e74c3c; border:none; padding:2px 6px; color:white; border-radius:3px; cursor:pointer; font-size:0.7rem; margin:0 1px;">🗑️</button>
                <button onclick="showAgentDetails('${a.code}')" style="background:#f39c12; border:none; padding:2px 6px; color:white; border-radius:3px; cursor:pointer; font-size:0.7rem; margin:0 1px;">👁️</button>
            </th>
        </tr>`;
    }
    html += '</tbody></table></div>';
    return html;
}
function filterAgentsList() {
    const term = document.getElementById('searchAgent')?.value.toLowerCase() || '';
    const group = document.getElementById('filterGroup')?.value || 'ALL';
    const status = document.getElementById('filterStatus')?.value || 'ALL';
    
    let filtered = agents;
    
    // Filtre par groupe (si différent de ALL)
    if (group !== 'ALL') {
        filtered = filtered.filter(a => a.groupe === group);
    }
    
    // Filtre par statut
    if (status !== 'ALL') {
        filtered = filtered.filter(a => a.statut === status);
    }
    
    // Filtre par recherche textuelle (code, nom, prénom)
    if (term !== '') {
        filtered = filtered.filter(a => 
            a.code.toLowerCase().includes(term) ||
            a.nom.toLowerCase().includes(term) ||
            a.prenom.toLowerCase().includes(term)
        );
    }
    
    // Appliquer aussi le filtre CP si nécessaire
    if (currentUser && currentUser.role === 'CP') {
        filtered = filtered.filter(a => a.groupe === currentUser.groupe);
    }
    
    const container = document.getElementById('agentsListContainer');
    if (container) {
        container.innerHTML = generateAgentsTable(filtered);
    }
}

function showAddAgentForm() {
    const html = `<div class="info-section"><h3>➕ Ajouter un Agent</h3>
        <div class="form-group"><label>Code *</label><input type="text" id="newCode" class="form-input" placeholder="Ex: A100"></div>
        <div class="form-group"><label>Nom *</label><input type="text" id="newNom" class="form-input"></div>
        <div class="form-group"><label>Prénom *</label><input type="text" id="newPrenom" class="form-input"></div>
        <div class="form-group"><label>Groupe *</label><select id="newGroupe" class="form-input"><option value="A">👥 Groupe A</option><option value="B">👥 Groupe B</option><option value="C">👥 Groupe C</option><option value="D">👥 Groupe D</option><option value="E">👥 Groupe E</option><option value="J">🃏 Joker</option></select></div>
        <div class="form-group"><label>Téléphone</label><input type="tel" id="newTel" class="form-input"></div>
        <div class="form-group"><label>Matricule</label><input type="text" id="newMatricule" class="form-input"></div>
        <div class="form-group"><label>CIN</label><input type="text" id="newCin" class="form-input"></div>
        <div class="form-group"><label>Poste</label><input type="text" id="newPoste" class="form-input"></div>
        <div class="form-group"><label>Date entrée</label><input type="date" id="newDateEntree" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Adresse</label><input type="text" id="newAdresse" class="form-input"></div>
        <div class="form-group"><label>Email</label><input type="email" id="newEmail" class="form-input"></div>
        <button class="popup-button green" onclick="addNewAgent()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="showAgentsList()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

async function addNewAgent() {
    const code = document.getElementById('newCode').value.toUpperCase();
    const nom = document.getElementById('newNom').value;
    const prenom = document.getElementById('newPrenom').value;
    const groupe = document.getElementById('newGroupe').value;
    const tel = document.getElementById('newTel').value;
    const matricule = document.getElementById('newMatricule').value;
    const cin = document.getElementById('newCin').value;
    const poste = document.getElementById('newPoste').value;
    let date_entree = document.getElementById('newDateEntree').value;
    const adresse = document.getElementById('newAdresse').value;
    const email = document.getElementById('newEmail').value;

    if (!code || !nom || !prenom) { alert("⚠️ Code, Nom et Prénom requis!"); return; }
    if (agents.find(a => a.code === code)) { alert(`⚠️ Le code ${code} existe déjà!`); return; }

    // Formater la date si la fonction existe, sinon garder la valeur brute
    if (typeof formatDateUTC === 'function' && date_entree) {
        date_entree = formatDateUTC(date_entree);
    }

    // Ajout local
    agents.push({ 
        code, nom, prenom, groupe, tel, matricule, cin, poste, 
        date_entree, adresse, email, 
        statut: 'actif', 
        date_sortie: null,
        date_naissance: '',
        adresse: adresse || '',
        email: email || ''
    });
    
    saveData();
    await saveSharedAgents();
    
    alert(`✅ Agent ${code} ajouté avec succès!`);
    showAgentsList();
}

function showEditAgent(code) {
    const agent = agents.find(a => a.code === code);
    if (!agent) return;
    
    const html = `<div class="info-section"><h3>✏️ Modifier ${code}</h3>
        <div class="form-group"><label>Nom</label><input type="text" id="editNom" value="${agent.nom}" class="form-input"></div>
        <div class="form-group"><label>Prénom</label><input type="text" id="editPrenom" value="${agent.prenom}" class="form-input"></div>
        <div class="form-group"><label>Groupe</label><select id="editGroupe" class="form-input">${['A','B','C','D','E','J'].map(g => `<option value="${g}" ${agent.groupe === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="form-group"><label>Téléphone</label><input type="text" id="editTel" value="${agent.tel || ''}" class="form-input"></div>
        <div class="form-group"><label>Matricule</label><input type="text" id="editMatricule" value="${agent.matricule || ''}" class="form-input"></div>
        <div class="form-group"><label>CIN</label><input type="text" id="editCin" value="${agent.cin || ''}" class="form-input"></div>
        <div class="form-group"><label>Poste</label><input type="text" id="editPoste" value="${agent.poste || ''}" class="form-input"></div>
        <div class="form-group"><label>Date entrée</label><input type="date" id="editDateEntree" value="${agent.date_entree || ''}" class="form-input"></div>
        <div class="form-group"><label>Adresse</label><input type="text" id="editAdresse" value="${agent.adresse || ''}" class="form-input"></div>
        <div class="form-group"><label>Email</label><input type="email" id="editEmail" value="${agent.email || ''}" class="form-input"></div>
        <div class="form-group"><label>Statut</label><select id="editStatut" class="form-input"><option value="actif" ${agent.statut === 'actif' ? 'selected' : ''}>🟢 Actif</option><option value="inactif" ${agent.statut === 'inactif' ? 'selected' : ''}>🔴 Inactif</option></select></div>
        <button class="popup-button green" onclick="updateAgent('${code}')">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="showAgentsList()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

async function updateAgent(code) {
    const idx = agents.findIndex(a => a.code === code);
    if (idx !== -1) {
        const oldAgent = { ...agents[idx] };
        
        agents[idx].nom = document.getElementById('editNom').value;
        agents[idx].prenom = document.getElementById('editPrenom').value;
        agents[idx].groupe = document.getElementById('editGroupe').value;
        agents[idx].tel = document.getElementById('editTel').value;
        agents[idx].matricule = document.getElementById('editMatricule').value;
        agents[idx].cin = document.getElementById('editCin').value;
        agents[idx].poste = document.getElementById('editPoste').value;
       agents[idx].date_entree = formatDateUTC(document.getElementById('editDateEntree').value); 
        
        agents[idx].adresse = document.getElementById('editAdresse').value;
        agents[idx].email = document.getElementById('editEmail').value;
        agents[idx].statut = document.getElementById('editStatut').value;
        
        if (agents[idx].statut === 'inactif' && !agents[idx].date_sortie) {
            agents[idx].date_sortie = new Date().toISOString().split('T')[0];
        }
        
        if (oldAgent.nom !== agents[idx].nom) addNotification('agent_update', { action: 'update', agentCode: code, agentName: `${agents[idx].nom} ${agents[idx].prenom}`, field: 'Nom', oldValue: oldAgent.nom, newValue: agents[idx].nom });
        if (oldAgent.prenom !== agents[idx].prenom) addNotification('agent_update', { action: 'update', agentCode: code, agentName: `${agents[idx].nom} ${agents[idx].prenom}`, field: 'Prénom', oldValue: oldAgent.prenom, newValue: agents[idx].prenom });
        if (oldAgent.groupe !== agents[idx].groupe) addNotification('agent_update', { action: 'update', agentCode: code, agentName: `${agents[idx].nom} ${agents[idx].prenom}`, field: 'Groupe', oldValue: oldAgent.groupe, newValue: agents[idx].groupe });
        if (oldAgent.tel !== agents[idx].tel) addNotification('agent_update', { action: 'update', agentCode: code, agentName: `${agents[idx].nom} ${agents[idx].prenom}`, field: 'Téléphone', oldValue: oldAgent.tel || 'vide', newValue: agents[idx].tel || 'vide' });
        if (oldAgent.statut !== agents[idx].statut) addNotification('agent_update', { action: 'update', agentCode: code, agentName: `${agents[idx].nom} ${agents[idx].prenom}`, field: 'Statut', oldValue: oldAgent.statut, newValue: agents[idx].statut });
        
        saveData();
        
await saveSharedAgents(); 
        alert(`✅ Agent ${code} modifié!`);
    location.reload();   
    
    }
}

async function deleteAgent(code) {
    if (!checkPassword("Suppression d'agent")) return;
    const agent = agents.find(a => a.code === code);
    if (confirm(`Supprimer définitivement l'agent ${code} ?`)) {
        agents = agents.filter(a => a.code !== code);

        addNotification('agent_delete', { action: 'delete', agentCode: code, agentName: `${agent.nom} ${agent.prenom}` });
                saveData();
 await saveSharedAgents();
        alert(`✅ Agent ${code} supprimé!`);
        location.reload();
    }
}

function showAgentDetails(code) {
    const a = agents.find(ag => ag.code === code);
    if (!a) return;
    const html = `<div class="info-section"><h3>👤 Fiche Agent: ${a.nom} ${a.prenom}</h3>
        <div class="info-item"><span class="info-label">📋 Code:</span> ${a.code}</div>
        <div class="info-item"><span class="info-label">👥 Groupe:</span> ${a.groupe}</div>
        <div class="info-item"><span class="info-label">📞 Téléphone:</span> ${a.tel || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📧 Email:</span> ${a.email || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📍 Adresse:</span> ${a.adresse || 'N/A'}</div>
        <div class="info-item"><span class="info-label">🎫 Matricule:</span> ${a.matricule || 'N/A'}</div>
        <div class="info-item"><span class="info-label">🆔 CIN:</span> ${a.cin || 'N/A'}</div>
        <div class="info-item"><span class="info-label">💼 Poste:</span> ${a.poste || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📅 Date entrée:</span> ${a.date_entree || 'N/A'}</div>
        <div class="info-item"><span class="info-label">📅 Date sortie:</span> ${a.date_sortie || 'En activité'}</div>
        <div class="info-item"><span class="info-label">⚡ Statut:</span> ${a.statut === 'actif' ? '🟢 Actif' : '🔴 Inactif'}</div>
        <button class="popup-button gray" onclick="showAgentsList()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showMyInfo() {
    if (!currentUser) return;
    const agent = agents.find(a => a.code === currentUser.agentCode);
    if (!agent) {
        alert("Aucune fiche agent associée à votre compte");
        return;
    }
    const html = `<div class="info-section"><h3>👤 Mes Informations</h3>
        <div class="info-item"><span class="info-label">Code:</span> ${agent.code}</div>
        <div class="info-item"><span class="info-label">Nom:</span> ${agent.nom}</div>
        <div class="info-item"><span class="info-label">Prénom:</span> ${agent.prenom}</div>
        <div class="info-item"><span class="info-label">Groupe:</span> ${agent.groupe}</div>
        <div class="info-item"><span class="info-label">Téléphone:</span> ${agent.tel || '-'}</div>
        <div class="info-item"><span class="info-label">Email:</span> ${agent.email || '-'}</div>
        <div class="info-item"><span class="info-label">Poste:</span> ${agent.poste || '-'}</div>
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showImportCSVForm() {
    const html = `<div class="info-section"><h3>📥 Importer CSV</h3>
        <div class="form-group"><label>Fichier CSV (format: code;nom;prenom;groupe;tel)</label><input type="file" id="csvFile" accept=".csv"></div>
        <button class="popup-button green" onclick="importCSVFile()">📥 Importer</button>
        <button class="popup-button gray" onclick="displayAgentsMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function importCSVFile() {
    const file = document.getElementById('csvFile').files[0];
    if (!file) { alert("⚠️ Sélectionnez un fichier"); return; }
    const reader = new FileReader();
    reader.onload = e => {
        const lines = e.target.result.split(/\r?\n/);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(';');
            if (cols.length >= 4 && cols[0] && cols[1] && cols[2]) {
                if (!agents.find(a => a.code === cols[0].toUpperCase())) {
                    agents.push({ code: cols[0].toUpperCase(), nom: cols[1], prenom: cols[2], groupe: cols[3] || 'A', tel: cols[4] || '', statut: 'actif', date_entree: new Date().toISOString().split('T')[0] });
                    count++;
                }
            }
        }
        saveData();
        alert(`✅ ${count} agents importés`);
        showAgentsList();
    };
    reader.readAsText(file, 'UTF-8');
}

function exportAgentsCSV() {
    let csv = "Code;Nom;Prénom;Groupe;Téléphone;Matricule;CIN;Poste;Adresse;Email;Statut;Date entrée;Date sortie\n";
    agents.forEach(a => csv += `${a.code};${a.nom};${a.prenom};${a.groupe};${a.tel || ''};${a.matricule || ''};${a.cin || ''};${a.poste || ''};${a.adresse || ''};${a.email || ''};${a.statut};${a.date_entree || ''};${a.date_sortie || ''}\n`);
    downloadCSV(csv, `agents_${new Date().toISOString().split('T')[0]}.csv`);
}

function downloadCSV(content, filename) {
    const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    showSnackbar(`✅ ${filename} exporté`);
}

// ==================== PARTIE 13 : GESTION DU PLANNING 
function displayPlanningMenu() {
    if (currentUser.role === 'AGENT') {
        viewAgentPlanning();
        return;
    }
    displaySubMenu("GESTION DU PLANNING", [
        { text: "📅 Planning Mensuel", onclick: "showMonthlyPlanningForm()" },
        { text: "👥 Planning par Groupe", onclick: "showGroupPlanningForm()" },
        { text: "👤 Planning par Agent", onclick: "showAgentPlanningForm()" },
        { text: "✏️ Modifier Shift", onclick: "showShiftModificationForm()" },
        { text: "🔄 Échanger Shifts", onclick: "showShiftExchangeForm()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function generatePlanningHeader(daysInMonth, month, year) {
    let header = '<thead><tr style="background-color:#34495e;">';
    header += '<th style="padding:8px;">Agent</th><th style="padding:8px;">Groupe</th>';
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month-1, d);
        const dayName = JOURS_FRANCAIS[date.getDay()];
        const isHoliday = isHolidayDate(date);
        const holidayIcon = isHoliday ? '🎉 ' : '';
        header += `<th style="padding:4px; ${isHoliday ? 'background:#f39c12; color:#2c3e50;' : ''}">${holidayIcon}${d}<br><span style="font-size:0.65em;">${dayName}</span></th>`;
    }
    header += '<th style="padding:8px;">✅ Travail</th><th style="padding:8px;">🏖️ Congés</th><th style="padding:8px;">🎉 Fériés</th><th style="padding:8px;">⭐ Total</th></tr></thead>';
    return header;
}

function showMonthlyPlanningForm() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let html = `<div class="info-section"><h3>📅 Planning Mensuel</h3>
        <div class="form-group"><label>Mois</label><select id="planMonth" class="form-input">${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${MOIS_FRANCAIS[i]}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="planYear" class="form-input" value="${currentYear}"></div>`;
    
    if (currentUser.role === 'CP') {
        html += `<input type="hidden" id="planGroupFilter" value="${currentUser.groupe}"><p style="color:#f39c12; margin-bottom:10px;">📌 Groupe ${currentUser.groupe} (votre groupe uniquement)</p>`;
    } else {
        html += `<div class="form-group"><label>Groupe</label><select id="planGroupFilter" class="form-input">
            <option value="ALL">📋 Tous les groupes</option><option value="A">👥 Groupe A</option><option value="B">👥 Groupe B</option>
            <option value="C">👥 Groupe C</option><option value="D">👥 Groupe D</option><option value="E">👥 Groupe E</option><option value="J">🃏 Jokers</option>
        </select></div>`;
    }
    html += `<button class="popup-button green" onclick="generateGlobalPlanning()">📋 Générer</button>
        <button class="popup-button gray" onclick="displayPlanningMenu()">Annuler</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generateGlobalPlanning() {
    const month = parseInt(document.getElementById('planMonth').value);
    const year = parseInt(document.getElementById('planYear').value);
    let groupFilter = currentUser.role === 'CP' ? currentUser.groupe : document.getElementById('planGroupFilter').value;
    showGlobalPlanningWithTotals(month, year, groupFilter);
}

function showGlobalPlanningWithTotals(month, year, groupFilter = 'ALL') {
  alert("planningData au moment de l'affichage : " + JSON.stringify(planningData));
alert("Génération du planning, planningData contient " + Object.keys(planningData).length + " mois"); 
    let actifs = agents.filter(a => a.statut === 'actif');
    if (currentUser.role === 'CP') {
        actifs = actifs.filter(a => a.groupe === currentUser.groupe);
    } else if (groupFilter !== 'ALL') {
        actifs = actifs.filter(a => a.groupe === groupFilter);
    }
    if (!actifs.length) { alert("⚠️ Aucun agent trouvé"); return; }
    
    const daysInMonth = new Date(year, month, 0).getDate();
    let title = `📅 Planning Global - ${getMonthName(month)} ${year}`;
    if (currentUser.role === 'CP') title += ` (Groupe ${currentUser.groupe})`;
    else if (groupFilter !== 'ALL') title += ` (Groupe ${groupFilter})`;
    
    let html = `<div class="info-section"><h3>${title}</h3><div style="overflow-x:auto;"><table class="planning-table" style="width:100%; border-collapse:collapse;">
        ${generatePlanningHeader(daysInMonth, month, year)}<tbody>`;
    
    for (const agent of actifs) {
        const stats = calculateAgentStats(agent.code, month, year);
        html += `<tr><td style="padding:6px;"><strong>${agent.code}</strong><br>${agent.nom} ${agent.prenom}</td>
            <td style="text-align:center; padding:6px;">${agent.groupe}</td>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
          
console.log(`Affichage - Agent: ${agent.code}, Date: ${dateStr}, Shift: ${getShiftForAgent(agent.code, dateStr)}`); 
            const date = new Date(year, month-1, d);
            const shiftDisplay = getShiftDisplay(agent.code, dateStr);
            const shift = getShiftForAgent(agent.code, dateStr);
            const color = SHIFT_COLORS[shift] || '#7f8c8d';
            const isHoliday = isHolidayDate(date);
            let additionalStyle = isHoliday && (shift === '1' || shift === '2' || shift === '3') ? 'border: 2px solid #f39c12;' : '';
            
            html += `<td style="background-color:${color}; color:white; text-align:center; padding:4px; ${additionalStyle}" title="${shiftDisplay}">${shiftDisplay}</td>`;
        }
        html += `<td style="text-align:center; font-weight:bold; color:#27ae60;">${stats.travaillesNormaux}</td>
            <td style="text-align:center; font-weight:bold; color:#f39c12;">${stats.conges}</td>
            <td style="text-align:center; font-weight:bold; color:#e67e22;">${stats.feriesTravailles}</td>
            <td style="text-align:center; font-weight:bold; background:#2c3e50; color:#f1c40f;">${stats.totalGeneral}</td></tr>`;
    }
    html += `</tbody></table></div><button class="popup-button gray" onclick="displayPlanningMenu()" style="margin-top:15px;">↩️ Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}


function showGroupPlanningForm() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let groups = ['A', 'B', 'C', 'D', 'E', 'J'];
    if (currentUser.role === 'CP') groups = [currentUser.groupe, 'J'];
    
    const html = `<div class="info-section"><h3>👥 Planning par Groupe</h3>
        <div class="form-group"><label>Groupe</label><select id="groupPlanGroup" class="form-input">${groups.map(g => `<option value="${g}">${g === 'J' ? '🃏 Jokers' : '👥 Groupe ' + g}</option>`).join('')}</select></div>
        <div class="form-group"><label>Mois</label><select id="groupPlanMonth" class="form-input">${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${MOIS_FRANCAIS[i]}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="groupPlanYear" class="form-input" value="${currentYear}"></div>
        <button class="popup-button green" onclick="executeGroupPlanning()">📋 Voir</button>
        <button class="popup-button gray" onclick="displayPlanningMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function executeGroupPlanning() {
    const group = document.getElementById('groupPlanGroup').value;
    const month = parseInt(document.getElementById('groupPlanMonth').value);
    const year = parseInt(document.getElementById('groupPlanYear').value);
    showGroupPlanningWithTotals(group, month, year);
}
function showGroupStatsForm() {
    if (!currentUser || currentUser.role !== 'CP') {
        alert("Accès réservé aux chefs de patrouille");
        return;
    }
    const group = currentUser.groupe;
    if (!group) {
        alert("Groupe non défini pour ce CP");
        return;
    }
    // Afficher les stats pour son groupe
    showGlobalStatsForGroup(group);
}

function showGlobalStatsForGroup(group) {
    const agentsGroupe = agents.filter(a => a.groupe === group && a.statut === 'actif');
    if (agentsGroupe.length === 0) {
        alert(`Aucun agent actif dans le groupe ${group}`);
        return;
    }
    let totalTravailles = 0, totalConges = 0, totalMaladies = 0, totalAutres = 0;
    Object.keys(planningData).forEach(monthKey => {
        agentsGroupe.forEach(agent => {
            const agentData = planningData[monthKey]?.[agent.code];
            if (agentData) {
                Object.values(agentData).forEach(rec => {
                    if (rec.shift === 'C') totalConges++;
                    else if (rec.shift === 'M') totalMaladies++;
                    else if (rec.shift === 'A') totalAutres++;
                    else if (['1','2','3'].includes(rec.shift)) totalTravailles++;
                });
            }
        });
    });
    const html = `<div class="info-section"><h3>📊 Statistiques Groupe ${group}</h3>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${agentsGroupe.length}</div><div>👥 Agents</div></div>
            <div class="stat-card"><div class="stat-value">${totalTravailles}</div><div>✅ Jours travaillés</div></div>
            <div class="stat-card"><div class="stat-value">${totalConges}</div><div>🏖️ Congés</div></div>
            <div class="stat-card"><div class="stat-value">${totalMaladies}</div><div>🤒 Maladies</div></div>
            <div class="stat-card"><div class="stat-value">${totalAutres}</div><div>📝 Autres absences</div></div>
        </div>
        <button class="popup-button gray" onclick="displayMainMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
function showGroupPlanningWithTotals(group, month, year) {
    let groupAgents;
    if (group === 'J') {
        groupAgents = agents.filter(a => a.groupe === 'J' && a.statut === 'actif');
    } else {
        groupAgents = agents.filter(a => a.groupe === group && a.statut === 'actif');
    }
    if (!groupAgents.length) { alert(`⚠️ Aucun agent dans ${group === 'J' ? 'les jokers' : 'le groupe ' + group}`); return; }
    
    const daysInMonth = new Date(year, month, 0).getDate();
    let title = `📅 Planning ${group === 'J' ? 'des Jokers' : 'Groupe ' + group} - ${getMonthName(month)} ${year}`;
    
    let html = `<div class="info-section"><h3>${title}</h3><div style="overflow-x:auto;"><table class="planning-table" style="width:100%; border-collapse:collapse;">
        ${generatePlanningHeader(daysInMonth, month, year)}<tbody>`;
    
    for (const agent of groupAgents) {
        const stats = calculateAgentStats(agent.code, month, year);
        html += `<tr><td style="padding:6px;"><strong>${agent.code}</strong><br>${agent.nom} ${agent.prenom}</td>
            <td style="text-align:center; padding:6px;">${agent.groupe}</td>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
            
       
            
            // === AJOUTEZ CES LIGNES ICI ===
            //console.log("=== DEBUG PLANNING ===");
          //  console.log("Agent:", agent.code);
        //    console.log("Date recherchée:", dateStr);
            const monthKey = dateStr.substring(0,7);
            const shiftData = planningData[monthKey]?.[agent.code]?.[dateStr];
           // console.log("Donnée trouvée dans planningData:", shiftData);
          
  
            
            const date = new Date(year, month-1, d);
            const shiftDisplay = getShiftDisplay(agent.code, dateStr);
            const shift = getShiftForAgent(agent.code, dateStr);
            const color = SHIFT_COLORS[shift] || '#7f8c8d';
            const isHoliday = isHolidayDate(date);
            let additionalStyle = isHoliday && (shift === '1' || shift === '2' || shift === '3') ? 'border: 2px solid #f39c12;' : '';
            html += `<td style="background-color:${color}; color:white; text-align:center; padding:4px; ${additionalStyle}" title="${shiftDisplay}">${shiftDisplay}</td>`;
        }
        html += `<td style="text-align:center; font-weight:bold; color:#27ae60;">${stats.travaillesNormaux}</td>
            <td style="text-align:center; font-weight:bold; color:#f39c12;">${stats.conges}</td>
            <td style="text-align:center; font-weight:bold; color:#e67e22;">${stats.feriesTravailles}</td>
            <td style="text-align:center; font-weight:bold; background:#2c3e50; color:#f1c40f;">${stats.totalGeneral}</td></tr>`;
    }
    html += `</tbody></table></div><button class="popup-button gray" onclick="displayPlanningMenu()" style="margin-top:15px;">↩️ Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAgentPlanningForm() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let agentsList = getFilteredAgents();
    
    const html = `<div class="info-section"><h3>👤 Planning par Agent</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchAgentPlan" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterAgentPlanList()"></div>
        <div class="form-group"><label>Agent</label><select id="agentPlanAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Mois</label><select id="agentPlanMonth" class="form-input">${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${MOIS_FRANCAIS[i]}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="agentPlanYear" class="form-input" value="${currentYear}"></div>
        <button class="popup-button green" onclick="executeAgentPlanning()">📋 Voir</button>
        <button class="popup-button gray" onclick="displayPlanningMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterAgentPlanList() {
    const term = document.getElementById('searchAgentPlan').value.toLowerCase();
    const select = document.getElementById('agentPlanAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

function executeAgentPlanning() {
    const agentCode = document.getElementById('agentPlanAgent').value;
    const month = parseInt(document.getElementById('agentPlanMonth').value);
    const year = parseInt(document.getElementById('agentPlanYear').value);
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    showAgentPlanningWithTotals(agentCode, month, year);
}

function showAgentPlanningWithTotals(agentCode, month, year) {
    const agent = agents.find(a => a.code === agentCode);
    if (!agent) { alert("⚠️ Agent non trouvé"); return; }
    
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month-1, day);
        if (isHolidayDate(date)) monthHolidays.push({ day, description: getHolidayDescription(date).description });
    }
    const stats = calculateAgentStats(agentCode, month, year);
    let rows = [];
    
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
        const date = new Date(year, month-1, d);
        const dayName = JOURS_FRANCAIS[date.getDay()];
        const shift = getShiftForAgent(agentCode, dateStr);
        const shiftDisplay = getShiftDisplay(agentCode, dateStr);
        const color = SHIFT_COLORS[shift] || '#7f8c8d';
        const isHoliday = isHolidayDate(date);
        const holidayInfo = monthHolidays.find(h => h.day === d);
        let shiftIcon = '';
        if (shift === '1') shiftIcon = '🌅 '; else if (shift === '2') shiftIcon = '☀️ '; else if (shift === '3') shiftIcon = '🌙 ';
        else if (shift === 'R') shiftIcon = '😴 '; else if (shift === 'C') shiftIcon = '🏖️ '; else if (shift === 'M') shiftIcon = '🤒 '; else if (shift === 'A') shiftIcon = '📝 ';
        
        let holidayBadge = '';
        if (isHoliday && holidayInfo) {
            if (shift === '1' || shift === '2' || shift === '3') holidayBadge = `<span style="background:#e67e22; color:white; padding:2px 6px; border-radius:10px; font-size:0.7em;">🎉 Férié travaillé: ${holidayInfo.description}</span>`;
            else holidayBadge = `<span style="background:#f39c12; color:#2c3e50; padding:2px 6px; border-radius:10px; font-size:0.7em;">🎉 ${holidayInfo.description}</span>`;
        }
        
        const replacement = getReplacementInfo(agentCode, dateStr);
        let replacementHtml = '';
        if (replacement) {
            if (replacement.type === 'remplace_par') replacementHtml = `<br><span style="font-size:0.7em; color:#f1c40f;">🔄 Remplacé par ${replacement.agent}</span>`;
            else if (replacement.type === 'remplace') replacementHtml = `<br><span style="font-size:0.7em; color:#2ecc71;">🔄 Remplace ${replacement.agent}</span>`;
        }
        
        rows.push(`<tr style="border-bottom:1px solid #34495e;">
            <td style="padding:8px; text-align:center; width:60px;"><strong>${d}</strong><br><span style="font-size:0.7em;">${dayName}</span></td>
            <td style="background-color:${color}; color:white; text-align:center; padding:8px; font-weight:bold;">${shiftIcon}${shiftDisplay}${replacementHtml}</td>
            <td style="padding:8px; text-align:center;">${holidayBadge || '-'}</td>
            ${currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'CP') ? `<td style="padding:8px; text-align:center;"><button class="action-btn small red" onclick="deleteShift('${agentCode}','${dateStr}')" title="Supprimer">🗑️</button></td>` : ''}
        </tr>`);
    }
    
    let html = `<div class="info-section"><h3>📅 Planning de ${agent.nom} ${agent.prenom} (${agent.code})</h3>
        <p><strong>Période:</strong> ${getMonthName(month)} ${year}</p>
        ${monthHolidays.length > 0 ? `<div style="background:#2c3e50; padding:10px; border-radius:8px; margin-bottom:15px;"><strong>📅 Jours fériés ce mois-ci :</strong><br><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">${monthHolidays.map(h => `<span style="background:#f39c12; color:#2c3e50; padding:3px 10px; border-radius:15px; font-size:0.8em;">🎉 ${h.day} ${getMonthName(month)}: ${h.description}</span>`).join('')}</div></div>` : '<p style="color:#7f8c8d; margin-bottom:15px;">📅 Aucun jour férié ce mois-ci</p>'}
        <div style="overflow-x:auto;"><table class="planning-table" style="width:100%; border-collapse:collapse;"><thead><tr style="background-color:#34495e;"><th>Date</th><th>Shift</th><th>Jours fériés</th>${currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'CP') ? '<th>Action</th>' : ''}</tr></thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot style="background-color:#2c3e50;"><tr><td colspan="3" style="padding:15px;"><div style="display:grid; grid-template-columns:repeat(4,1fr); gap:15px; text-align:center;">
        <div style="background:#27ae60; padding:10px; border-radius:8px;">✅ Jours travaillés<br><span style="font-size:1.5em; font-weight:bold;">${stats.travaillesNormaux}</span></div>
        <div style="background:#f39c12; padding:10px; border-radius:8px;">🏖️ Congés (C)<br><span style="font-size:1.5em; font-weight:bold;">${stats.conges}</span></div>
        <div style="background:#e67e22; padding:10px; border-radius:8px;">🎉 Fériés travaillés<br><span style="font-size:1.5em; font-weight:bold;">${stats.feriesTravailles}</span></div>
        <div style="background:#f1c40f; color:#2c3e50; padding:10px; border-radius:8px;">⭐ TOTAL GÉNÉRAL<br><span style="font-size:1.8em; font-weight:bold;">${stats.totalGeneral}</span></div></div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; text-align:center; margin-top:10px; font-size:0.85em;"><div>🤒 Maladie (M): ${stats.maladie} <span style="color:#e74c3c">(non compté)</span></div><div>📝 Autre absence (A): ${stats.autre} <span style="color:#e74c3c">(non compté)</span></div><div>😴 Repos (R): ${stats.repos}</div></div></td></tr></tfoot>
        </table></div>
        <button class="popup-button gray" onclick="displayPlanningMenu()" style="margin-top:15px;">↩️ Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showShiftModificationForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>✏️ Modifier un Shift</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchShiftAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterShiftAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="shiftAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Date</label><input type="date" id="shiftDate" class="form-input"></div>
        <div class="form-group"><label>Nouveau shift</label><select id="newShift" class="form-input">${Object.entries(SHIFT_LABELS).map(([c, l]) => `<option value="${c}">${c} - ${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>Commentaire</label><textarea id="shiftComment" class="form-input" rows="2"></textarea></div>
        <button class="popup-button green" onclick="applyShiftModification()">💾 Appliquer</button>
        <button class="popup-button gray" onclick="displayPlanningMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterShiftAgentList() {
    const term = document.getElementById('searchShiftAgent').value.toLowerCase();
    const select = document.getElementById('shiftAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}
async function applyShiftModification() {
    const agentCode = document.getElementById('shiftAgent').value;
    const dateStrRaw = document.getElementById('shiftDate').value;
    const newShift = document.getElementById('newShift').value;
    const comment = document.getElementById('shiftComment').value;
    if (!agentCode || !dateStrRaw) { alert("⚠️ Agent et date requis"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    
    // ✅ CORRECTION ICI
    const dateStr = formatDateUTC(dateStrRaw);
    
    const oldShift = getShiftForAgent(agentCode, dateStr);
    const monthKey = dateStr.substring(0,7);
    if (!planningData[monthKey]) planningData[monthKey] = {};
    if (!planningData[monthKey][agentCode]) planningData[monthKey][agentCode] = {};
    planningData[monthKey][agentCode][dateStr] = { shift: newShift, type: 'modification', comment };
    saveData();
    await saveSharedPlanning(); 
    
    addNotification('shift_modification', {
        action: 'update', agentCode: agentCode,
        agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`,
        date: dateStr, oldValue: oldShift, newValue: newShift, comment: comment
    });
    alert(`✅ Shift modifié pour ${agentCode} le ${dateStr}`);
    displayPlanningMenu();
}

function showShiftExchangeForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>🔄 Échanger Shifts</h3>
        <div class="form-group"><label>Agent 1</label><select id="exchangeAgent1" class="form-input">${agentsList.map(a => `<option value="${a.code}">${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Date 1</label><input type="date" id="exchangeDate1" class="form-input"></div>
        <div class="form-group"><label>Agent 2</label><select id="exchangeAgent2" class="form-input">${agentsList.map(a => `<option value="${a.code}">${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Date 2</label><input type="date" id="exchangeDate2" class="form-input"></div>
        <div class="form-group"><label>Motif</label><textarea id="exchangeReason" class="form-input" rows="2"></textarea></div>
        <button class="popup-button green" onclick="executeShiftExchange()">🔄 Échanger</button>
        <button class="popup-button gray" onclick="displayPlanningMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

async function executeShiftExchange() {
    const a1 = document.getElementById('exchangeAgent1').value;
    const d1 = document.getElementById('exchangeDate1').value;
    const a2 = document.getElementById('exchangeAgent2').value;
    const d2 = document.getElementById('exchangeDate2').value;
    const reason = document.getElementById('exchangeReason').value;
    if (!a1 || !d1 || !a2 || !d2) { alert("⚠️ Tous les champs requis"); return; }
    if (!canAccessAgent(a1) || !canAccessAgent(a2)) { alert("⚠️ Vous n'avez pas accès à ces agents"); return; }
    
    const s1 = getShiftForAgent(a1, d1);
    const s2 = getShiftForAgent(a2, d2);
    const m1 = d1.substring(0,7), m2 = d2.substring(0,7);
    if (!planningData[m1]) planningData[m1] = {};
    if (!planningData[m1][a1]) planningData[m1][a1] = {};
    if (!planningData[m2]) planningData[m2] = {};
    if (!planningData[m2][a2]) planningData[m2][a2] = {};
    planningData[m1][a1][d1] = { shift: s2, type: 'echange', comment: `Échangé avec ${a2} - ${reason}` };
    planningData[m2][a2][d2] = { shift: s1, type: 'echange', comment: `Échangé avec ${a1} - ${reason}` };
    saveData();
    await saveSharedPlanning();
    
    addNotification('shift_exchange', {
        action: 'exchange', agent1Code: a1, agent1Name: `${agents.find(a => a.code === a1)?.nom || a1} ${agents.find(a => a.code === a1)?.prenom || ''}`,
        agent2Code: a2, agent2Name: `${agents.find(a => a.code === a2)?.nom || a2} ${agents.find(a => a.code === a2)?.prenom || ''}`,
        date1: d1, date2: d2, reason: reason
    });
    alert(`✅ Échange effectué entre ${a1} et ${a2}`);
    displayPlanningMenu();
}

function deleteShift(agentCode, dateStr) {
    if (!checkPassword("Suppression de shift")) return;
    if (confirm(`Supprimer le shift du ${dateStr} pour ${agentCode} ?`)) {
        const monthKey = dateStr.substring(0,7);
        if (planningData[monthKey]?.[agentCode]?.[dateStr]) {
            delete planningData[monthKey][agentCode][dateStr];
            saveData();
            alert("✅ Shift supprimé");
            const [year, month] = dateStr.split('-');
            showAgentPlanningWithTotals(agentCode, parseInt(month), parseInt(year));
        }
    }
}

// ==================== PARTIE 14 : CONGÉS & ABSENCES 

function displayLeavesMenu() {
    if (currentUser.role === 'AGENT') {
        alert("⚠️ Les agents ne peuvent pas gérer les congés collectifs");
        displayMainMenu();
        return;
    }
    displaySubMenu("CONGÉS & ABSENCES", [
        { text: "➕ Ajouter Congé", onclick: "showAddLeaveForm()" },
        { text: "📋 Liste des Congés", onclick: "showLeavesList()" },
        { text: "📅 Congés par Agent", onclick: "showLeavesByAgentForm()" },
        { text: "📊 Congés par Groupe", onclick: "showLeavesByGroupForm()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddLeaveForm() {
    let agentsList = getFilteredAgents().filter(a => a.groupe !== 'J');
    const html = `<div class="info-section"><h3>🏖️ Ajouter Congé/Absence</h3>
        <div class="form-group"><label>Type</label><select id="leaveType" class="form-input" onchange="toggleLeavePeriod()">
            <option value="single">Ponctuel</option><option value="period">Période</option></select></div>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchLeaveAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterLeaveAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="leaveAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}</select></div>
        <div id="singleLeaveSection"><div class="form-group"><label>Date</label><input type="date" id="leaveDate" class="form-input"></div>
        <div class="form-group"><label>Type absence</label><select id="absenceType" class="form-input"><option value="C">🏖️ Congé</option><option value="M">🤒 Maladie</option><option value="A">📝 Autre absence</option></select></div></div>
        <div id="periodLeaveSection" style="display:none"><div class="form-group"><label>Date début</label><input type="date" id="periodStart" class="form-input"></div>
        <div class="form-group"><label>Date fin</label><input type="date" id="periodEnd" class="form-input"></div></div>
        <div class="form-group"><label>Commentaire</label><textarea id="leaveComment" class="form-input" rows="2" placeholder="Motif du congé..."></textarea></div>
        <button class="popup-button green" onclick="saveLeaveWithJoker()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayLeavesMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function toggleLeavePeriod() {
    const type = document.getElementById('leaveType').value;
    document.getElementById('singleLeaveSection').style.display = type === 'single' ? 'block' : 'none';
    document.getElementById('periodLeaveSection').style.display = type === 'period' ? 'block' : 'none';
}

function filterLeaveAgentList() {
    const term = document.getElementById('searchLeaveAgent').value.toLowerCase();
    const select = document.getElementById('leaveAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

function groupConsecutiveLeaves(leavesList) {
    leavesList.sort((a, b) => new Date(a.date) - new Date(b.date));
    const grouped = [];
    let currentGroup = null;
    for (const leave of leavesList) {
        if (!currentGroup) {
            currentGroup = { agentCode: leave.agentCode, startDate: leave.date, endDate: leave.date, type: leave.type, comment: leave.comment };
        } else {
            const currentDate = new Date(leave.date);
            const lastDate = new Date(currentGroup.endDate);
            const diffDays = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
            if (diffDays === 1 && currentGroup.agentCode === leave.agentCode && currentGroup.type === leave.type) {
                currentGroup.endDate = leave.date;
            } else {
                grouped.push(currentGroup);
                currentGroup = { agentCode: leave.agentCode, startDate: leave.date, endDate: leave.date, type: leave.type, comment: leave.comment };
            }
        }
    }
    if (currentGroup) grouped.push(currentGroup);
    return grouped;
}

function showLeavesList() {
    let leavesList = [];
    Object.keys(planningData).forEach(monthKey => {
        Object.keys(planningData[monthKey]).forEach(agentCode => {
            if (!canAccessAgent(agentCode)) return;
            Object.keys(planningData[monthKey][agentCode]).forEach(dateStr => {
                const rec = planningData[monthKey][agentCode][dateStr];
                if (rec && ['C', 'M', 'A'].includes(rec.shift)) {
                    leavesList.push({ agentCode, date: dateStr, type: rec.shift, comment: rec.comment });
                }
            });
        });
    });
    const groupedLeaves = groupConsecutiveLeaves(leavesList);
    const html = `<div class="info-section"><h3>📋 Liste des Congés</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;"><input type="text" id="searchLeaveList" placeholder="🔍 Rechercher par agent..." style="flex:1; padding:8px;" onkeyup="filterLeavesListGrouped()">
        <select id="filterLeaveType" onchange="filterLeavesListGrouped()" style="padding:8px;"><option value="ALL">Tous types</option><option value="C">🏖️ Congés</option><option value="M">🤒 Maladies</option><option value="A">📝 Autres</option></select></div>
        <div id="leavesListContainer">${generateLeavesListGrouped(groupedLeaves)}</div>
        <button class="popup-button gray" onclick="displayLeavesMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generateLeavesListGrouped(data) {
    if (!data.length) return '<p>Aucun congé enregistré</p>';
    const typeColors = { C: '#27ae60', M: '#e74c3c', A: '#f39c12' };
    const typeLabels = { C: '🏖️ Congé', M: '🤒 Maladie', A: '📝 Autre' };
    return `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Agent</th><th>Période</th><th>Type</th><th>Commentaire</th><th>Actions</th></tr></thead>
        <tbody>${data.map(l => {
            const agent = agents.find(a => a.code === l.agentCode);
            const periodDisplay = l.startDate === l.endDate ? formatDateToFrench(l.startDate) : `du ${formatDateToFrench(l.startDate)} au ${formatDateToFrench(l.endDate)}`;
            return `<tr><td><strong>${agent ? agent.nom + ' ' + agent.prenom : l.agentCode}</strong><br><small>${l.agentCode}</small></th>
                <td>${periodDisplay}</th><td><span style="background:${typeColors[l.type]}; padding:2px 8px; border-radius:12px;">${typeLabels[l.type]}</span></th>
                <td>${l.comment || '-'}</th><td><button class="action-btn small red" onclick="deleteLeavePeriod('${l.agentCode}','${l.startDate}','${l.endDate}')">🗑️ Supprimer</button></th>
            </td>`}).join('')}</tbody></table>`;
}

function filterLeavesListGrouped() {
    const term = document.getElementById('searchLeaveList').value.toLowerCase();
    const type = document.getElementById('filterLeaveType').value;
    let leavesList = [];
    Object.keys(planningData).forEach(monthKey => {
        Object.keys(planningData[monthKey]).forEach(agentCode => {
            if (!canAccessAgent(agentCode)) return;
            Object.keys(planningData[monthKey][agentCode]).forEach(dateStr => {
                const rec = planningData[monthKey][agentCode][dateStr];
                if (rec && ['C', 'M', 'A'].includes(rec.shift)) leavesList.push({ agentCode, date: dateStr, type: rec.shift, comment: rec.comment });
            });
        });
    });
    let filtered = leavesList.filter(l => {
        const agent = agents.find(a => a.code === l.agentCode);
        const matchTerm = (agent && (agent.nom.toLowerCase().includes(term) || agent.prenom.toLowerCase().includes(term))) || l.agentCode.toLowerCase().includes(term);
        const matchType = type === 'ALL' || l.type === type;
        return matchTerm && matchType;
    });
    const groupedFiltered = groupConsecutiveLeaves(filtered);
    document.getElementById('leavesListContainer').innerHTML = generateLeavesListGrouped(groupedFiltered);
}async function deleteLeavePeriod(agentCode, startDate, endDate) {
    if (!checkPassword("Suppression de congé")) return;
    if (confirm(`Supprimer les congés du ${formatDateToFrench(startDate)} au ${formatDateToFrench(endDate)} pour ${agentCode} ?`)) {
        let current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
          

const dateStr = formatDateUTC(current); 
            const monthKey = dateStr.substring(0,7);
            if (planningData[monthKey]?.[agentCode]?.[dateStr]) delete planningData[monthKey][agentCode][dateStr];
            for (const joker of agents.filter(a => a.groupe === 'J')) {
                const jokerEntry = planningData[monthKey]?.[joker.code]?.[dateStr];
                if (jokerEntry && jokerEntry.type === 'remplacement_joker' && jokerEntry.comment && jokerEntry.comment.includes(agentCode)) {
                    delete planningData[monthKey][joker.code][dateStr];
                    break;
                }
            }
            current.setDate(current.getDate() + 1);
        }
        replacementNotifications = replacementNotifications.filter(notif => !(notif.agent_absent === agentCode && ((notif.date_debut && startDate >= notif.date_debut && endDate <= notif.date_fin) || (notif.date_absence && startDate <= notif.date_absence && endDate >= notif.date_absence))));
        saveData();
        addNotification('leave_delete', { action: 'delete', agentCode: agentCode, agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`, startDate: startDate, endDate: endDate });
        alert("✅ Congés et remplacements supprimés !");
        // Supprimer du cloud
await deleteLeaveFromCloud(agentCode, startDate, endDate);
// Supprimer la période de congesList
congesList = congesList.filter(c => !(c.agentCode === agentCode && c.startDate === startDate && c.endDate === endDate));
await saveSharedConges();
        
        showLeavesList();
        
    }
}

function showLeavesByAgentForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>📅 Congés par Agent</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchLeavesByAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterLeavesByAgentSelect()"></div>
        <div class="form-group"><label>Agent</label><select id="leavesByAgentSelect" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="leavesYear" class="form-input" value="${new Date().getFullYear()}"></div>
        <button class="popup-button green" onclick="showLeavesByAgentResult()">📋 Voir</button>
        <button class="popup-button gray" onclick="displayLeavesMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterLeavesByAgentSelect() {
    const term = document.getElementById('searchLeavesByAgent').value.toLowerCase();
    const select = document.getElementById('leavesByAgentSelect');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

function showLeavesByAgentResult() {
    const agentCode = document.getElementById('leavesByAgentSelect').value;
    const year = parseInt(document.getElementById('leavesYear').value);
    const agent = agents.find(a => a.code === agentCode);
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    let agentLeaves = [];
    Object.keys(planningData).forEach(monthKey => {
        if (monthKey.startsWith(year.toString()) && planningData[monthKey][agentCode]) {
            Object.keys(planningData[monthKey][agentCode]).forEach(dateStr => {
                const rec = planningData[monthKey][agentCode][dateStr];
                if (rec && ['C', 'M', 'A'].includes(rec.shift)) agentLeaves.push({ date: dateStr, type: rec.shift, comment: rec.comment });
            });
        }
    });
    const groupedLeaves = groupConsecutiveLeaves(agentLeaves.map(l => ({ ...l, agentCode })));
    const typeLabels = { C: '🏖️ Congé', M: '🤒 Maladie', A: '📝 Autre' };
    const html = `<div class="info-section"><h3>📅 Congés de ${agent.nom} ${agent.prenom} (${year})</h3>
        <div class="stats-grid"><div class="stat-card"><div class="stat-value">${agentLeaves.filter(l => l.type === 'C').length}</div><div>🏖️ Congés</div></div>
        <div class="stat-card"><div class="stat-value">${agentLeaves.filter(l => l.type === 'M').length}</div><div>🤒 Maladies</div></div>
        <div class="stat-card"><div class="stat-value">${agentLeaves.filter(l => l.type === 'A').length}</div><div>📝 Autres</div></div>
        <div class="stat-card"><div class="stat-value">${agentLeaves.length}</div><div>📊 Total absences</div></div></div>
        ${agentLeaves.length ? `<table class="classement-table"><thead><tr><th>Période</th><th>Type</th><th>Commentaire</th></tr></thead>
        <tbody>${groupedLeaves.map(l => `<tr><td>${l.startDate === l.endDate ? formatDateToFrench(l.startDate) : `du ${formatDateToFrench(l.startDate)} au ${formatDateToFrench(l.endDate)}`}</th><td>${typeLabels[l.type]}</th><td>${l.comment || '-'}</th><tr>`).join('')}</tbody></table>` : '<p>Aucun congé cette année</p>'}
        <button class="popup-button gray" onclick="showLeavesByAgentForm()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showLeavesByGroupForm() {
    let groups = ['A', 'B', 'C', 'D', 'E', 'J'];
    if (currentUser.role === 'CP') groups = [currentUser.groupe];
    const html = `<div class="info-section"><h3>📊 Congés par Groupe</h3>
        <div class="form-group"><label>Groupe</label><select id="leavesByGroupSelect" class="form-input">${groups.map(g => `<option value="${g}">Groupe ${g}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="leavesGroupYear" class="form-input" value="${new Date().getFullYear()}"></div>
        <button class="popup-button green" onclick="showLeavesByGroupResult()">📊 Afficher</button>
        <button class="popup-button gray" onclick="displayLeavesMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showLeavesByGroupResult() {
    const group = document.getElementById('leavesByGroupSelect').value;
    const year = parseInt(document.getElementById('leavesGroupYear').value);
    if (!canAccessGroup(group)) { alert("⚠️ Vous n'avez pas accès à ce groupe"); return; }
    const groupAgents = agents.filter(a => a.groupe === group && a.statut === 'actif');
    let stats = groupAgents.map(agent => {
        let conges = 0, maladies = 0, autres = 0;
        Object.keys(planningData).forEach(monthKey => {
            if (monthKey.startsWith(year.toString()) && planningData[monthKey][agent.code]) {
                Object.values(planningData[monthKey][agent.code]).forEach(rec => {
                    if (rec.shift === 'C') conges++;
                    else if (rec.shift === 'M') maladies++;
                    else if (rec.shift === 'A') autres++;
                });
            }
        });
        return { agent, conges, maladies, autres, total: conges + maladies + autres };
    });
    const totals = stats.reduce((acc, s) => { acc.conges += s.conges; acc.maladies += s.maladies; acc.autres += s.autres; acc.total += s.total; return acc; }, { conges: 0, maladies: 0, autres: 0, total: 0 });
    const html = `<div class="info-section"><h3>📊 Congés Groupe ${group} - ${year}</h3>
        <div class="stats-grid"><div class="stat-card"><div class="stat-value">${totals.conges}</div><div>🏖️ Congés</div></div>
        <div class="stat-card"><div class="stat-value">${totals.maladies}</div><div>🤒 Maladies</div></div>
        <div class="stat-card"><div class="stat-value">${totals.autres}</div><div>📝 Autres</div></div>
        <div class="stat-card"><div class="stat-value">${totals.total}</div><div>📊 Total absences</div></div></div>
        <table class="classement-table"><thead><tr><th>Agent</th><th>🏖️ Congés</th><th>🤒 Maladies</th><th>📝 Autres</th><th>📊 Total</th></tr></thead>
        <tbody>${stats.map(s => `<tr><td><strong>${s.agent.nom} ${s.agent.prenom}</strong><br><small>${s.agent.code}</small></th><td style="text-align:center">${s.conges}</th><td style="text-align:center">${s.maladies}</th><td style="text-align:center">${s.autres}</th><td style="text-align:center; font-weight:bold">${s.total}</th></tr>`).join('')}</tbody></table>
        <button class="popup-button gray" onclick="showLeavesByGroupForm()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

// ==================== PARTIE 15 : CODES PANIQUE, RADIOS, HABILLEMENT, AVERTISSEMENTS ====================
// Conservez vos fonctions existantes (displayPanicMenu, displayRadiosMenu, displayUniformMenu, displayWarningsMenu)
//  CODES PANIQUE ====================
function displayPanicMenu() {
    if (currentUser.role === 'AGENT') {
        showAgentPanicCode();
        return;
    }
    displaySubMenu("CODES PANIQUE", [
        { text: "➕ Ajouter Code", onclick: "showAddPanicForm()" },
        { text: "📋 Liste des Codes", onclick: "showPanicList()" },
        { text: "🔍 Rechercher Code", onclick: "showSearchPanicForm()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddPanicForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>➕ Ajouter Code Panique</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchPanicAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterPanicAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="panicAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}</select></div>
        <div class="form-group"><label>Code *</label><input type="text" id="panicCode" class="form-input" placeholder="Ex: 1234"></div>
        <div class="form-group"><label>Poste/Secteur</label><input type="text" id="panicPoste" class="form-input"></div>
        <div class="form-group"><label>Commentaire</label><textarea id="panicComment" class="form-input" rows="2"></textarea></div>
        <button class="popup-button green" onclick="savePanic()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayPanicMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterPanicAgentList() {
    const term = document.getElementById('searchPanicAgent').value.toLowerCase();
    const select = document.getElementById('panicAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}
async function savePanic() {
  alert ("savePanic début");
    const agentCode = document.getElementById('panicAgent').value;
    const code = document.getElementById('panicCode').value.toUpperCase();
    const poste = document.getElementById('panicPoste').value;
    const comment = document.getElementById('panicComment').value;
    if (!agentCode || !code) { alert("⚠️ Agent et code requis!"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    
    const existing = panicCodes.find(p => p.agent_code === agentCode);
    if (existing) {
        existing.code = code;
        existing.poste = poste;
        existing.comment = comment;
        existing.updated_at = new Date().toISOString();
    } else {
        panicCodes.push({ agent_code: agentCode, code, poste, comment, created_at: new Date().toISOString() });
    }
    saveData();
    alert("avant saveSharedPanique");
    await saveSharedPanique();  // <-- AJOUTER CETTE LIGNE
    
    addNotification('panic_add', { action: existing ? 'update' : 'create', agentCode: agentCode, agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`, code: code });
    alert(`✅ Code panique enregistré pour ${agentCode}`);
    showPanicList();
}

function showPanicList() {
    let filteredCodes = panicCodes.filter(p => canAccessAgent(p.agent_code));
    let html = `<div class="info-section"><h3>📋 Codes Panique</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px;"><input type="text" id="searchPanicList" placeholder="🔍 Rechercher par code ou agent..." style="flex:1; padding:8px;" onkeyup="filterPanicList()"></div>
        <div id="panicListContainer">${generatePanicList(filteredCodes)}</div>
        <button class="popup-button gray" onclick="displayPanicMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generatePanicList(data) {
    if (!data.length) return '<p style="text-align:center; padding:20px;">Aucun code panique enregistré</p>';
    return `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Agent</th><th>Code</th><th>Poste/Secteur</th><th>Commentaire</th><th>Actions</th></tr></thead>
        <tbody>${data.map(p => {
            const agent = agents.find(a => a.code === p.agent_code);
            return `<tr style="border-bottom:1px solid #34495e;">
                <td><strong>${agent ? agent.nom + ' ' + agent.prenom : p.agent_code}</strong><br><small>${p.agent_code}</small></th>
                <td style="text-align:center;"><span style="background:#e74c3c; color:white; padding:4px 12px; border-radius:20px; font-weight:bold;">${p.code}</span></th>
                <td>${p.poste || '-'}</th><td>${p.comment || '-'}</th>
                <td><button class="action-btn small orange" onclick="modifyPanic('${p.agent_code}')" title="Modifier">✏️</button>
                <button class="action-btn small red" onclick="deletePanic('${p.agent_code}')" title="Supprimer">🗑️</button></th>
            </tr>`}).join('')}</tbody>}</div>`;
}

function filterPanicList() {
    const term = document.getElementById('searchPanicList').value.toLowerCase();
    const filtered = panicCodes.filter(p => {
        if (!canAccessAgent(p.agent_code)) return false;
        const agent = agents.find(a => a.code === p.agent_code);
        return p.code.toLowerCase().includes(term) || (agent && (agent.nom.toLowerCase().includes(term) || agent.prenom.toLowerCase().includes(term)));
    });
    document.getElementById('panicListContainer').innerHTML = generatePanicList(filtered);
}

function showSearchPanicForm() {
    const html = `<div class="info-section"><h3>🔍 Rechercher Code Panique</h3>
        <div class="form-group"><label>Code ou nom agent</label><input type="text" id="searchPanicInput" class="form-input" placeholder="Entrez le code ou le nom..." onkeyup="searchPanicCode()"></div>
        <div id="searchPanicResult" style="margin-top:15px;"></div>
        <button class="popup-button gray" onclick="displayPanicMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function searchPanicCode() {
    const term = document.getElementById('searchPanicInput').value.toLowerCase();
    if (!term) { document.getElementById('searchPanicResult').innerHTML = ''; return; }
    const results = panicCodes.filter(p => {
        if (!canAccessAgent(p.agent_code)) return false;
        const agent = agents.find(a => a.code === p.agent_code);
        return p.code.toLowerCase().includes(term) || (agent && (agent.nom.toLowerCase().includes(term) || agent.prenom.toLowerCase().includes(term)));
    });
    document.getElementById('searchPanicResult').innerHTML = results.length ? generatePanicList(results) : '<p style="text-align:center; padding:20px;">Aucun code panique trouvé</p>';
}

async function deletePanic(agentCode) {
    if (!checkPassword("Suppression code panique")) return;
    if (confirm(`Supprimer le code panique de ${agentCode} ?`)) {
        panicCodes = panicCodes.filter(p => p.agent_code !== agentCode);
        saveData();
        await saveSharedPanique();  // <-- AJOUTER CETTE LIGNE
        alert("✅ Code panique supprimé!");
        showPanicList();
    }
}

async function modifyPanic(agentCode) {
    const panic = panicCodes.find(p => p.agent_code === agentCode);
    if (!panic) return;
    const newCode = prompt("Nouveau code (ex: 1234) :", panic.code);
    if (newCode && newCode.trim()) panic.code = newCode.toUpperCase();
    const newPoste = prompt("Nouveau poste/secteur :", panic.poste || "");
    if (newPoste !== null) panic.poste = newPoste;
    const newComment = prompt("Nouveau commentaire :", panic.comment || "");
    if (newComment !== null) panic.comment = newComment;
    panic.updated_at = new Date().toISOString();
    saveData();
    await saveSharedPanique();  // <-- AJOUTER CETTE LIGNE
    alert("✅ Code panique modifié");
    showPanicList();
}

//   RADIOS ====================

function displayRadiosMenu() {
    displaySubMenu("GESTION RADIOS", [
        { text: "➕ Ajouter Radio", onclick: "showAddRadioForm()" },
        { text: "📋 Liste des Radios", onclick: "showRadiosList()" },
        { text: "📲 Attribuer Radio", onclick: "showAssignRadioForm()" },
        { text: "🔄 Retour Radio", onclick: "showReturnRadioForm()" },
        { text: "📊 Statut Radios", onclick: "showRadiosStatus()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddRadioForm() {
    const html = `<div class="info-section"><h3>➕ Ajouter Radio</h3>
        <div class="form-group"><label>ID *</label><input type="text" id="radioId" class="form-input" placeholder="Ex: RAD-001"></div>
        <div class="form-group"><label>Modèle *</label><input type="text" id="radioModel" class="form-input" placeholder="Ex: Motorola GP340"></div>
        <div class="form-group"><label>Numéro série</label><input type="text" id="radioSerial" class="form-input"></div>
        <div class="form-group"><label>Statut</label><select id="radioStatus" class="form-input"><option value="DISPONIBLE">✅ Disponible</option><option value="ATTRIBUEE">📲 Attribuée</option><option value="HS">🔴 HS</option><option value="REPARATION">🔧 Réparation</option></select></div>
        <div class="form-group"><label>Prix (DH)</label><input type="number" id="radioPrice" class="form-input" step="0.01" placeholder="0.00"></div>
        <button class="popup-button green" onclick="saveRadio()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayRadiosMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function saveRadio() {
    const id = document.getElementById('radioId').value.toUpperCase();
    const model = document.getElementById('radioModel').value;
    const serial = document.getElementById('radioSerial').value;
    const status = document.getElementById('radioStatus').value;
    const price = document.getElementById('radioPrice').value;
    if (!id || !model) { alert("⚠️ ID et Modèle requis!"); return; }
    if (radios.find(r => r.id === id)) { alert(`⚠️ Radio ${id} existe déjà!`); return; }
    radios.push({ id, model, serial, status, price: price ? parseFloat(price) : null, created_at: new Date().toISOString() });
    saveData();
    alert(`✅ Radio ${id} ajoutée!`);
    showRadiosList();
}

function showRadiosList() {
    let filteredRadios = radios;
    if (currentUser.role === 'CP') {
        const groupAgents = agents.filter(a => a.groupe === currentUser.groupe && a.statut === 'actif').map(a => a.code);
        filteredRadios = radios.filter(r => !r.attributed_to || groupAgents.includes(r.attributed_to));
    }
    let html = `<div class="info-section"><h3>📋 Inventaire Radios</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;"><input type="text" id="searchRadio" placeholder="🔍 Rechercher par ID ou modèle..." style="flex:1; padding:8px;" onkeyup="filterRadioList()">
        <select id="filterRadioStatus" onchange="filterRadioList()" style="padding:8px;"><option value="ALL">Tous statuts</option><option value="DISPONIBLE">✅ Disponible</option><option value="ATTRIBUEE">📲 Attribuée</option><option value="HS">🔴 HS</option><option value="REPARATION">🔧 Réparation</option></select></div>
        <div id="radiosListContainer">${generateRadiosList(filteredRadios)}</div>
        <button class="popup-button gray" onclick="displayRadiosMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generateRadiosList(data) {
    if (!data.length) return '<p style="text-align:center; padding:20px;">Aucune radio trouvée</p>';
    const statusColors = { DISPONIBLE: '#27ae60', ATTRIBUEE: '#f39c12', HS: '#e74c3c', REPARATION: '#e67e22' };
    const statusLabels = { DISPONIBLE: '✅ Disponible', ATTRIBUEE: '📲 Attribuée', HS: '🔴 HS', REPARATION: '🔧 Réparation' };
    return `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>ID</th><th>Modèle</th><th>Série</th><th>Statut</th><th>Prix</th><th>Attribuée à</th><th>Actions</th></tr></thead>
        <tbody>${data.map(r => {
            const agent = r.attributed_to ? agents.find(a => a.code === r.attributed_to) : null;
            return `<tr style="border-bottom:1px solid #34495e;">
                <td><strong>${r.id}</strong></th><td>${r.model}</th><td>${r.serial || '-'}</th>
                <td><span style="background:${statusColors[r.status]}; color:white; padding:4px 10px; border-radius:20px;">${statusLabels[r.status]}</span></th>
                <td>${r.price ? r.price + ' DH' : '-'}</th><td>${agent ? agent.nom + ' ' + agent.prenom + ' (' + agent.code + ')' : '-'}</th>
                <td><button class="action-btn small blue" onclick="showEditRadio('${r.id}')">✏️</button>
                <button class="action-btn small red" onclick="deleteRadio('${r.id}')">🗑️</button>
                ${r.status === 'DISPONIBLE' ? `<button class="action-btn small green" onclick="showAssignRadioForm('${r.id}')">📲</button>` : ''}
                ${r.status === 'ATTRIBUEE' ? `<button class="action-btn small orange" onclick="showReturnRadioForm('${r.id}')">🔄</button>` : ''}</th>
            </tr>`}).join('')}</tbody>}</div>`;
}

function filterRadioList() {
    let filteredRadios = radios;
    if (currentUser.role === 'CP') {
        const groupAgents = agents.filter(a => a.groupe === currentUser.groupe && a.statut === 'actif').map(a => a.code);
        filteredRadios = radios.filter(r => !r.attributed_to || groupAgents.includes(r.attributed_to));
    }
    const term = document.getElementById('searchRadio').value.toLowerCase();
    const status = document.getElementById('filterRadioStatus').value;
    filteredRadios = filteredRadios.filter(r => r.id.toLowerCase().includes(term) || r.model.toLowerCase().includes(term));
    if (status !== 'ALL') filteredRadios = filteredRadios.filter(r => r.status === status);
    document.getElementById('radiosListContainer').innerHTML = generateRadiosList(filteredRadios);
}

function showEditRadio(id) {
    const radio = radios.find(r => r.id === id);
    if (!radio) return;
    const html = `<div class="info-section"><h3>✏️ Modifier Radio ${id}</h3>
        <div class="form-group"><label>Modèle</label><input type="text" id="editRadioModel" value="${radio.model}" class="form-input"></div>
        <div class="form-group"><label>Série</label><input type="text" id="editRadioSerial" value="${radio.serial || ''}" class="form-input"></div>
        <div class="form-group"><label>Statut</label><select id="editRadioStatus" class="form-input">
            <option value="DISPONIBLE" ${radio.status === 'DISPONIBLE' ? 'selected' : ''}>✅ Disponible</option>
            <option value="ATTRIBUEE" ${radio.status === 'ATTRIBUEE' ? 'selected' : ''}>📲 Attribuée</option>
            <option value="HS" ${radio.status === 'HS' ? 'selected' : ''}>🔴 HS</option>
            <option value="REPARATION" ${radio.status === 'REPARATION' ? 'selected' : ''}>🔧 Réparation</option></select></div>
        <div class="form-group"><label>Prix (DH)</label><input type="number" id="editRadioPrice" value="${radio.price || ''}" class="form-input" step="0.01"></div>
        <button class="popup-button green" onclick="updateRadio('${id}')">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="showRadiosList()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function updateRadio(id) {
    const idx = radios.findIndex(r => r.id === id);
    if (idx !== -1) {
        radios[idx].model = document.getElementById('editRadioModel').value;
        radios[idx].serial = document.getElementById('editRadioSerial').value;
        radios[idx].status = document.getElementById('editRadioStatus').value;
        radios[idx].price = parseFloat(document.getElementById('editRadioPrice').value) || null;
        radios[idx].updated_at = new Date().toISOString();
        saveData();
        alert(`✅ Radio ${id} modifiée!`);
        showRadiosList();
    }
}

function deleteRadio(id) {
    if (!checkPassword("Suppression radio")) return;
    if (confirm(`Supprimer définitivement la radio ${id} ?`)) {
        radios = radios.filter(r => r.id !== id);
        saveData();
        alert("✅ Radio supprimée!");
        showRadiosList();
    }
}

function showAssignRadioForm(radioId = null) {
    let availableRadios = radios.filter(r => r.status === 'DISPONIBLE');
    if (currentUser.role === 'CP') {
        const groupAgents = agents.filter(a => a.groupe === currentUser.groupe).map(a => a.code);
        availableRadios = availableRadios.filter(r => !r.attributed_to || groupAgents.includes(r.attributed_to));
    }
    const radioSelect = radioId ? `<input type="text" value="${radioId}" readonly class="form-input">` : `<select id="assignRadioId" class="form-input">${availableRadios.map(r => `<option value="${r.id}">${r.id} - ${r.model}</option>`).join('')}</select>`;
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>📲 Attribuer une Radio</h3>
        <div class="form-group"><label>Radio</label>${radioSelect}</div>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchAssignAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterAssignAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="assignAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <div class="form-group"><label>Date attribution</label><input type="date" id="assignDate" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <button class="popup-button green" onclick="executeAssignRadio()">✅ Attribuer</button>
        <button class="popup-button gray" onclick="displayRadiosMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterAssignAgentList() {
    const term = document.getElementById('searchAssignAgent').value.toLowerCase();
    const select = document.getElementById('assignAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

function executeAssignRadio() {
    const radioId = document.getElementById('assignRadioId')?.value || document.querySelector('input[readonly]')?.value;
    const agentCode = document.getElementById('assignAgent').value;
    const assignDate = document.getElementById('assignDate').value;
    if (!radioId || !agentCode) { alert("⚠️ Radio et agent requis"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    const radio = radios.find(r => r.id === radioId);
    if (!radio || radio.status !== 'DISPONIBLE') { alert("⚠️ Radio non disponible"); return; }
    radio.status = 'ATTRIBUEE';
    radio.attributed_to = agentCode;
    radio.attribution_date = assignDate;
    radio.updated_at = new Date().toISOString();
    saveData();
    alert(`✅ Radio ${radioId} attribuée à ${agentCode}`);
    showRadiosList();
}

function showReturnRadioForm(radioId = null) {
    let attribuees = radios.filter(r => r.status === 'ATTRIBUEE');
    if (currentUser.role === 'CP') {
        const groupAgents = agents.filter(a => a.groupe === currentUser.groupe && a.statut === 'actif').map(a => a.code);
        attribuees = attribuees.filter(r => r.attributed_to && groupAgents.includes(r.attributed_to));
    }
    const html = `<div class="info-section"><h3>🔄 Retour de Radio</h3>
        <div class="form-group"><label>Radio</label><select id="returnRadioId" class="form-input">${attribuees.map(r => { const agent = agents.find(a => a.code === r.attributed_to); return `<option value="${r.id}">${r.id} - ${r.model} (${agent ? agent.nom + ' ' + agent.prenom : r.attributed_to})</option>`; }).join('')}</select></div>
        <div class="form-group"><label>État retour</label><select id="returnCondition" class="form-input"><option value="BON">✅ Bon état</option><option value="USURE">⚠️ Légère usure</option><option value="DOMMAGE">🔧 Dommage</option><option value="HS">🔴 HS</option></select></div>
        <div class="form-group"><label>Nouveau statut</label><select id="returnNewStatus" class="form-input"><option value="DISPONIBLE">✅ Disponible</option><option value="REPARATION">🔧 Réparation</option><option value="HS">🔴 HS</option></select></div>
        <button class="popup-button green" onclick="executeReturnRadio()">🔄 Enregistrer retour</button>
        <button class="popup-button gray" onclick="displayRadiosMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function executeReturnRadio() {
    const radioId = document.getElementById('returnRadioId').value;
    const condition = document.getElementById('returnCondition').value;
    const newStatus = document.getElementById('returnNewStatus').value;
    const radio = radios.find(r => r.id === radioId);
    if (!radio) { alert("⚠️ Radio non trouvée"); return; }
    radio.status = newStatus;
    radio.return_date = new Date().toISOString().split('T')[0];
    radio.return_condition = condition;
    radio.attributed_to = null;
    radio.updated_at = new Date().toISOString();
    saveData();
    alert(`✅ Radio ${radioId} retournée - Statut: ${newStatus === 'DISPONIBLE' ? 'Disponible' : (newStatus === 'REPARATION' ? 'En réparation' : 'HS')}`);
    showRadiosList();
}

function showRadiosStatus() {
    let filteredRadios = radios;
    if (currentUser.role === 'CP') {
        const groupAgents = agents.filter(a => a.groupe === currentUser.groupe && a.statut === 'actif').map(a => a.code);
        filteredRadios = radios.filter(r => !r.attributed_to || groupAgents.includes(r.attributed_to));
    }
    const total = filteredRadios.length;
    const disponible = filteredRadios.filter(r => r.status === 'DISPONIBLE').length;
    const attribuee = filteredRadios.filter(r => r.status === 'ATTRIBUEE').length;
    const hs = filteredRadios.filter(r => r.status === 'HS').length;
    const reparation = filteredRadios.filter(r => r.status === 'REPARATION').length;
    const totalValue = filteredRadios.reduce((s, r) => s + (r.price || 0), 0);
    const html = `<div class="info-section"><h3>📊 Statut des Radios</h3>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${total}</div><div>📻 Total radios</div></div>
            <div class="stat-card"><div class="stat-value" style="color:#27ae60">${disponible}</div><div>✅ Disponibles</div></div>
            <div class="stat-card"><div class="stat-value" style="color:#f39c12">${attribuee}</div><div>📲 Attribuées</div></div>
            <div class="stat-card"><div class="stat-value" style="color:#e74c3c">${hs}</div><div>🔴 HS</div></div>
            <div class="stat-card"><div class="stat-value" style="color:#e67e22">${reparation}</div><div>🔧 Réparation</div></div>
            <div class="stat-card"><div class="stat-value">${totalValue.toLocaleString()} DH</div><div>💰 Valeur totale</div></div>
        </div>
        <button class="popup-button gray" onclick="displayRadiosMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
//   HABILLEMENT ====================

function displayUniformMenu() {
    if (currentUser.role === 'AGENT') {
        showAgentUniform();
        return;
    }
    displaySubMenu("HABILLEMENT", [
        { text: "➕ Enregistrer Habillement", onclick: "showAddUniformForm()" },
        { text: "📋 Rapport Habillement", onclick: "showUniformReport()" },
        { text: "📊 Statistiques", onclick: "showUniformStats()" },
        { text: "📅 Échéances", onclick: "showUniformDeadlines()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddUniformForm() {
    let agentsList = getFilteredAgents();
    const articlesList = ['Chemise', 'Pantalon', 'Tricot', 'Ceinture', 'Chaussures', 'Cravate', 'Veste', 'Parka'];
    const html = `<div class="info-section"><h3>👔 Enregistrer Habillement</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchUniformAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterUniformAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="uniformAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}</select></div>
        <div class="form-group"><label>Articles fournis</label><div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">${articlesList.map(item => `<label><input type="checkbox" id="uniform_${item.toLowerCase()}" value="${item}"> ${item}</label>`).join('')}</div></div>
        <div class="form-group"><label>Date fourniture</label><input type="date" id="uniformDate" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Commentaires</label><textarea id="uniformComment" class="form-input" rows="2" placeholder="Observations, tailles, etc..."></textarea></div>
        <button class="popup-button green" onclick="saveUniform()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayUniformMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterUniformAgentList() {
    const term = document.getElementById('searchUniformAgent').value.toLowerCase();
    const select = document.getElementById('uniformAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}
function saveUniform() {
    const agentCode = document.getElementById('uniformAgent').value;
    const dateRaw = document.getElementById('uniformDate').value;
    const comment = document.getElementById('uniformComment').value;
    const articles = ['chemise', 'pantalon', 'tricot', 'ceinture', 'chaussures', 'cravate', 'veste', 'parka']
        .filter(a => document.getElementById(`uniform_${a}`).checked)
        .map(a => a.charAt(0).toUpperCase() + a.slice(1));
    
    if (!agentCode) { alert("⚠️ Sélectionnez un agent"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    if (articles.length === 0) { alert("⚠️ Sélectionnez au moins un article"); return; }
    
    // ✅ Utilisation de formatDateUTC
    const date = formatDateUTC(document.getElementById('uniformDate').value);
const now = formatDateUTC(new Date());
    
    const existing = uniforms.find(u => u.agentCode === agentCode);
    if (existing) {
        existing.date = date;
        existing.comment = comment;
        existing.articles = articles;
        existing.lastUpdated = now;
    } else {
        uniforms.push({ agentCode, date, comment, articles, lastUpdated: now });
    }
    
    saveData();
    addNotification('uniform_add', { 
        action: existing ? 'update' : 'create', 
        agentCode, 
        agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`, 
        articles: articles.join(', ') 
    });
    alert(`✅ Habillement enregistré pour ${agentCode} (${articles.length} articles)`);
    showUniformReport();
}

function showUniformReport() {
    let filteredUniforms = uniforms.filter(u => canAccessAgent(u.agentCode));
    let html = `<div class="info-section"><h3>👔 Rapport Habillement</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px;"><input type="text" id="searchUniformReport" placeholder="🔍 Rechercher par agent..." style="flex:1; padding:8px;" onkeyup="filterUniformReport()"></div>
        <div id="uniformReportContainer">${generateUniformReport(filteredUniforms)}</div>
        <button class="popup-button gray" onclick="displayUniformMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generateUniformReport(data) {
    if (!data.length) return '<p style="text-align:center; padding:20px;">Aucun enregistrement d\'habillement</p>';
    return `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Agent</th><th>Date</th><th>Articles</th><th>Commentaire</th><th>Actions</th></tr></thead>
        <tbody>${data.map(u => {
            const agent = agents.find(a => a.code === u.agentCode);
            return `<tr style="border-bottom:1px solid #34495e;">
                <td><strong>${agent ? agent.nom + ' ' + agent.prenom : u.agentCode}</strong><br><small>${u.agentCode}</small></th>
                <td>${u.date}</th><td>${u.articles ? u.articles.map(a => `<span style="background:#2c3e50; padding:2px 6px; border-radius:12px; margin:2px; display:inline-block;">${a}</span>`).join('') : '-'}</th>
                <td>${u.comment || '-'}</th>
                <td><button class="action-btn small orange" onclick="modifyUniform('${u.agentCode}')" title="Modifier">✏️</button>
                <button class="action-btn small red" onclick="deleteUniform('${u.agentCode}')" title="Supprimer">🗑️</button></th>
            </tr>`}).join('')}</tbody>}</div>`;
}

function filterUniformReport() {
    const term = document.getElementById('searchUniformReport').value.toLowerCase();
    let filtered = uniforms.filter(u => canAccessAgent(u.agentCode));
    filtered = filtered.filter(u => {
        const agent = agents.find(a => a.code === u.agentCode);
        return (agent && (agent.nom.toLowerCase().includes(term) || agent.prenom.toLowerCase().includes(term))) || u.agentCode.toLowerCase().includes(term);
    });
    document.getElementById('uniformReportContainer').innerHTML = generateUniformReport(filtered);
}

async function deleteUniform(agentCode) {
    if (!checkPassword("Suppression habillement")) return;
    if (confirm(`Supprimer l'enregistrement d'habillement de ${agentCode} ?`)) {
        uniforms = uniforms.filter(u => u.agentCode !== agentCode);
        saveData();
        await saveSharedHabillement;
        alert("✅ Habillement supprimé!");
        showUniformReport();
    }
}

function modifyUniform(agentCode) {
    const uniform = uniforms.find(u => u.agentCode === agentCode);
    if (!uniform) return;
    
    const newDate = prompt("Nouvelle date (AAAA-MM-JJ) :", uniform.date);
    if (newDate && newDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // ✅ Normalisation avec formatDateUTC
uniform.date = formatDateUTC(newDate);
uniform.lastUpdated = formatDateUTC(new Date());
    }
    
    const newComment = prompt("Nouveau commentaire :", uniform.comment || "");
    if (newComment !== null) uniform.comment = newComment;
    
    uniform.lastUpdated = formatDateUTC(new Date());
    saveData();
    alert("✅ Habillement modifié");
    showUniformReport();
}

function showUniformStats() {
    let filteredUniforms = uniforms.filter(u => canAccessAgent(u.agentCode));
    const totalEquipes = filteredUniforms.length;
    const articlesCount = {};
    filteredUniforms.forEach(u => { if (u.articles) u.articles.forEach(a => articlesCount[a] = (articlesCount[a] || 0) + 1); });
    let html = `<div class="info-section"><h3>📊 Statistiques Habillement</h3><div class="stats-grid"><div class="stat-card"><div class="stat-value">${totalEquipes}</div><div>👔 Agents équipés</div></div>`;
    Object.entries(articlesCount).forEach(([article, count]) => { html += `<div class="stat-card"><div class="stat-value">${count}</div><div>${article}s</div></div>`; });
    html += `</div><button class="popup-button gray" onclick="displayUniformMenu()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showUniformDeadlines() {
    let filteredUniforms = uniforms.filter(u => canAccessAgent(u.agentCode));
    const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const toRenew = filteredUniforms.filter(u => new Date(u.date) < twoYearsAgo);
    const html = `<div class="info-section"><h3>📅 Échéances Habillement (à renouveler)</h3>
        ${toRenew.length ? `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Agent</th><th>Dernière fourniture</th><th>Retard</th></tr></thead>
        <tbody>${toRenew.map(u => {
            const agent = agents.find(a => a.code === u.agentCode);
            const delay = Math.floor((new Date() - new Date(u.date)) / (1000 * 60 * 60 * 24));
            return `<tr style="border-bottom:1px solid #34495e;"><td><strong>${agent ? agent.nom + ' ' + agent.prenom : u.agentCode}</strong><br><small>${u.agentCode}</small></th><td>${u.date}</th><td style="color:#e74c3c;">${delay} jours</th></tr>`}).join('')}</tbody>}</div>` : '<p style="text-align:center; padding:20px;">✅ Aucune échéance dans les 2 ans</p>'}
        <button class="popup-button gray" onclick="displayUniformMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
//   AVERTISSEMENTS ====================

function displayWarningsMenu() {
    if (currentUser.role === 'AGENT') {
        showAgentWarnings();
        return;
    }
    displaySubMenu("AVERTISSEMENTS", [
        { text: "⚠️ Ajouter Avertissement", onclick: "showAddWarningForm()" },
        { text: "📋 Liste Avertissements", onclick: "showWarningsList()" },
        { text: "👤 Par Agent", onclick: "showAgentWarningsForm()" },
        { text: "📊 Statistiques", onclick: "showWarningsStats()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddWarningForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>⚠️ Ajouter Avertissement</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchWarningAgent" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterWarningAgentList()"></div>
        <div class="form-group"><label>Agent</label><select id="warningAgent" size="5" class="form-input" style="height:auto">${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}</select></div>
        <div class="form-group"><label>Type</label><select id="warningType" class="form-input"><option value="ORAL">🗣️ Oral</option><option value="ECRIT">📝 Écrit</option><option value="MISE_A_PIED">⛔ Mise à pied</option></select></div>
        <div class="form-group"><label>Date</label><input type="date" id="warningDate" class="form-input" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Description</label><textarea id="warningDesc" class="form-input" rows="3" placeholder="Décrivez l'avertissement..."></textarea></div>
        <button class="popup-button green" onclick="saveWarning()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayWarningsMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterWarningAgentList() {
    const term = document.getElementById('searchWarningAgent').value.toLowerCase();
    const select = document.getElementById('warningAgent');
    Array.from(select.options).forEach(opt => opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none');
}

async function saveWarning() {
    const agentCode = document.getElementById('warningAgent').value;
    const type = document.getElementById('warningType').value;
    const date = document.getElementById('warningDate').value;
    const description = document.getElementById('warningDesc').value;
    if (!agentCode || !description) { alert("⚠️ Agent et description requis!"); return; }
    if (!canAccessAgent(agentCode)) { alert("⚠️ Vous n'avez pas accès à cet agent"); return; }
    
    warnings.push({ id: Date.now(), agent_code: agentCode, type, date, description, status: 'active', created_at: new Date().toISOString() });
    saveData();
    await saveSharedAvertissements;
    addNotification('warning_add', { action: 'create', agentCode: agentCode, agentName: `${agents.find(a => a.code === agentCode)?.nom || agentCode} ${agents.find(a => a.code === agentCode)?.prenom || ''}`, warningType: type, description: description });
    alert(`✅ Avertissement enregistré pour ${agentCode}`);
    showWarningsList();
}

function showWarningsList() {
    let filteredWarnings = warnings.filter(w => canAccessAgent(w.agent_code));
    let html = `<div class="info-section"><h3>📋 Liste des Avertissements</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;"><input type="text" id="searchWarning" placeholder="🔍 Rechercher par agent..." style="flex:1; padding:8px;" onkeyup="filterWarningsList()">
        <select id="filterWarningType" onchange="filterWarningsList()" style="padding:8px;"><option value="ALL">Tous types</option><option value="ORAL">🗣️ Oral</option><option value="ECRIT">📝 Écrit</option><option value="MISE_A_PIED">⛔ Mise à pied</option></select>
        <select id="filterWarningStatus" onchange="filterWarningsList()" style="padding:8px;"><option value="ALL">Tous statuts</option><option value="active">🟢 Actifs</option><option value="archived">🔵 Archivés</option></select></div>
        <div id="warningsListContainer">${generateWarningsList(filteredWarnings)}</div>
        <button class="popup-button gray" onclick="displayWarningsMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function generateWarningsList(data) {
    if (!data.length) return '<p style="text-align:center; padding:20px;">Aucun avertissement</p>';
    const typeColors = { ORAL: '#f39c12', ECRIT: '#e74c3c', MISE_A_PIED: '#c0392b' };
    const typeLabels = { ORAL: '🗣️ Oral', ECRIT: '📝 Écrit', MISE_A_PIED: '⛔ Mise à pied' };
    return `<table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Agent</th><th>Type</th><th>Date</th><th>Description</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${data.sort((a, b) => new Date(b.date) - new Date(a.date)).map(w => {
            const agent = agents.find(a => a.code === w.agent_code);
            return `<tr style="border-bottom:1px solid #34495e;">
                <td><strong>${agent ? agent.nom + ' ' + agent.prenom : w.agent_code}</strong><br><small>${w.agent_code}</small></th>
                <td><span style="background:${typeColors[w.type]}; color:white; padding:4px 10px; border-radius:20px;">${typeLabels[w.type]}</span></th>
                <td>${w.date}</th><td>${w.description}</th>
                <td><span class="status-badge ${w.status === 'active' ? 'active' : 'inactive'}">${w.status === 'active' ? '🟢 Actif' : '🔵 Archivé'}</span></th>
                <td><button class="action-btn small orange" onclick="toggleWarningStatus(${w.id})" title="${w.status === 'active' ? 'Archiver' : 'Réactiver'}">${w.status === 'active' ? '📁' : '📂'}</button>
                <button class="action-btn small blue" onclick="modifyWarning(${w.id})" title="Modifier">✏️</button>
                <button class="action-btn small red" onclick="deleteWarning(${w.id})" title="Supprimer">🗑️</button></th>
            </tr>`}).join('')}</tbody>}</div>`;
}

function filterWarningsList() {
    const term = document.getElementById('searchWarning').value.toLowerCase();
    const type = document.getElementById('filterWarningType').value;
    const status = document.getElementById('filterWarningStatus').value;
    let filtered = warnings.filter(w => canAccessAgent(w.agent_code));
    filtered = filtered.filter(w => {
        const agent = agents.find(a => a.code === w.agent_code);
        const matchTerm = (agent && (agent.nom.toLowerCase().includes(term) || agent.prenom.toLowerCase().includes(term))) || w.agent_code.toLowerCase().includes(term);
        const matchType = type === 'ALL' || w.type === type;
        const matchStatus = status === 'ALL' || w.status === status;
        return matchTerm && matchType && matchStatus;
    });
    document.getElementById('warningsListContainer').innerHTML = generateWarningsList(filtered);
}

function showAgentWarningsForm() {
    let agentsList = getFilteredAgents();
    const html = `<div class="info-section"><h3>👤 Avertissements par Agent</h3>
        <div class="form-group"><label>🔍 Rechercher agent</label><input type="text" id="searchAgentWarnings" placeholder="Tapez pour rechercher..." class="form-input" onkeyup="filterAgentWarningsSelect()"></div>
        <div class="form-group"><label>Agent</label><select id="agentWarningsSelect" size="5" class="form-input" style="height:auto"><option value="">📋 Tous les agents</option>${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div>
        <button class="popup-button green" onclick="showAgentWarningsResult()">📋 Voir</button>
        <button class="popup-button gray" onclick="displayWarningsMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterAgentWarningsSelect() {
    const term = document.getElementById('searchAgentWarnings').value.toLowerCase();
    const select = document.getElementById('agentWarningsSelect');
    Array.from(select.options).forEach(opt => { if (opt.value === '') opt.style.display = ''; else opt.style.display = opt.text.toLowerCase().includes(term) ? '' : 'none'; });
}

function showAgentWarningsResult() {
    const agentCode = document.getElementById('agentWarningsSelect').value;
    let filtered = warnings.filter(w => canAccessAgent(w.agent_code));
    if (agentCode) filtered = filtered.filter(w => w.agent_code === agentCode);
    const html = `<div class="info-section"><h3>📋 Avertissements ${agentCode ? `pour ${agentCode}` : 'tous les agents'}</h3>${generateWarningsList(filtered)}<button class="popup-button gray" onclick="showAgentWarningsForm()">Retour</button></div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showWarningsStats() {
    let filteredWarnings = warnings.filter(w => canAccessAgent(w.agent_code));
    const byType = { ORAL: 0, ECRIT: 0, MISE_A_PIED: 0 };
    const byStatus = { active: 0, archived: 0 };
    const byAgent = {};
    filteredWarnings.forEach(w => { byType[w.type]++; byStatus[w.status]++; byAgent[w.agent_code] = (byAgent[w.agent_code] || 0) + 1; });
    const topAgent = Object.entries(byAgent).sort((a, b) => b[1] - a[1])[0];
    const topAgentName = topAgent ? (agents.find(a => a.code === topAgent[0])?.nom || topAgent[0]) : 'Aucun';
    const typeLabels = { ORAL: '🗣️ Oral', ECRIT: '📝 Écrit', MISE_A_PIED: '⛔ Mise à pied' };
    const html = `<div class="info-section"><h3>📊 Statistiques Avertissements</h3>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${byType.ORAL}</div><div>${typeLabels.ORAL}</div></div>
            <div class="stat-card"><div class="stat-value">${byType.ECRIT}</div><div>${typeLabels.ECRIT}</div></div>
            <div class="stat-card"><div class="stat-value">${byType.MISE_A_PIED}</div><div>${typeLabels.MISE_A_PIED}</div></div>
            <div class="stat-card"><div class="stat-value">${byStatus.active}</div><div>🟢 Actifs</div></div>
            <div class="stat-card"><div class="stat-value">${byStatus.archived}</div><div>🔵 Archivés</div></div>
            <div class="stat-card"><div class="stat-value">${filteredWarnings.length}</div><div>📊 Total</div></div>
        </div>
        <div class="info-item" style="margin-top:15px;"><span class="info-label">🏆 Agent le plus averti:</span> <strong>${topAgentName}</strong> (${topAgent?.[1] || 0} avertissements)</div>
        <button class="popup-button gray" onclick="displayWarningsMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

async function toggleWarningStatus(id) {
    const idx = warnings.findIndex(w => w.id === id);
    if (idx !== -1) {
        warnings[idx].status = warnings[idx].status === 'active' ? 'archived' : 'active';
        warnings[idx].updated_at = new Date().toISOString();
        saveData();
       await saveSharedAvertissements; 
        showSnackbar(warnings[idx].status === 'active' ? "✅ Avertissement réactivé" : "📁 Avertissement archivé");
        showWarningsList();
    }
}

async function deleteWarning(id) {
    if (!checkPassword("Suppression avertissement")) return;
    if (confirm("Supprimer définitivement cet avertissement ?")) {
        warnings = warnings.filter(w => w.id !== id);
        saveData();
       await saveSharedAvertissements; 
        alert("✅ Avertissement supprimé!");
        showWarningsList();
    }
}

async function modifyWarning(id) {
    const warning = warnings.find(w => w.id === id);
    if (!warning) return;
    const newType = prompt("Nouveau type (ORAL, ECRIT, MISE_A_PIED) :", warning.type);
    if (newType && ['ORAL', 'ECRIT', 'MISE_A_PIED'].includes(newType)) warning.type = newType;
    const newDesc = prompt("Nouvelle description :", warning.description);
    if (newDesc !== null) warning.description = newDesc;
    const newDate = prompt("Nouvelle date (AAAA-MM-JJ) :", warning.date);
    if (newDate && newDate.match(/^\d{4}-\d{2}-\d{2}$/)) warning.date = newDate;
    warning.updated_at = new Date().toISOString();
    saveData();
    await saveSharedAvertissements;
    alert("✅ Avertissement modifié");
    showWarningsList();
}
// ==================== PARTIE 16 : JOURS FÉRIÉS, EXPORTATIONS, CONFIGURATION ====================
// Conservez vos fonctions existantes (displayHolidaysMenu, displayExportMenu, displayConfigMenu)
//   JOURS FÉRIÉS ====================
function displayHolidaysMenu() {
    // Si l'utilisateur est un agent, afficher uniquement la consultation
    if (currentUser && currentUser.role === 'AGENT') {
        displaySubMenu("JOURS FÉRIÉS (consultation)", [
            { text: "📋 Liste des Jours Fériés", onclick: "showHolidaysList()" },
            { text: "📅 Calendrier Annuel", onclick: "showHolidaysCalendar()" },
            { text: "↩️ Retour", onclick: "displayAgentMenu()", className: "back-button" }
        ]);
        return;
    }
    // Pour ADMIN et CP (si vous voulez aussi CP sans ajout ? A vous de voir)
    // Si CP doit aussi être limité, ajoutez une condition similaire.
    // Sinon, gardez le menu complet pour ADMIN.
    displaySubMenu("JOURS FÉRIÉS", [
        { text: "➕ Ajouter Jour Férié", onclick: "showAddHolidayForm()" },
        { text: "📋 Liste Jours Fériés", onclick: "showHolidaysList()" },
        { text: "📅 Calendrier Annuel", onclick: "showHolidaysCalendar()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showAddHolidayForm() {
    if (currentUser && currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayHolidaysMenu();
        return;
    }

    const currentYear = new Date().getFullYear();
    const html = `<div class="info-section"><h3>🎉 Ajouter Jour Férié</h3>
        <div class="form-group"><label>Date</label><input type="date" id="holidayDate" class="form-input" value="${currentYear}-01-01"></div>
        <div class="form-group"><label>Description</label><input type="text" id="holidayDesc" class="form-input" placeholder="Ex: Aïd Al-Fitr, Fête du Trône..."></div>
        <div class="form-group"><label>Type</label><select id="holidayType" class="form-input"><option value="fixe">📅 Fixe</option><option value="religieux">🕌 Religieux</option><option value="national">🇲🇦 National</option></select></div>
        <button class="popup-button green" onclick="saveHoliday()">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="displayHolidaysMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function saveHoliday() {
    if (currentUser && currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayHolidaysMenu();
        return;
    }
    
    const fullDate = document.getElementById('holidayDate').value;
    const description = document.getElementById('holidayDesc').value;
    const type = document.getElementById('holidayType').value;
    if (!fullDate || !description) { alert("⚠️ Date et description requises!"); return; }
    const monthDay = fullDate.substring(5);
    if (holidays.find(h => h.date === monthDay)) { alert("⚠️ Ce jour férié existe déjà!"); return; }
    holidays.push({ date: monthDay, description, type, isRecurring: true });
    saveData();
    alert(`✅ Jour férié ajouté: ${description} (${fullDate})`);
    showHolidaysList();
}

function showHolidaysList() {
    if (!holidays.length) {
        const html = `<div class="info-section"><h3>📋 Liste des Jours Fériés</h3><p style="text-align:center; padding:20px; color:#e74c3c;">Aucun jour férié enregistré</p>
            <button class="popup-button green" onclick="showAddHolidayForm()">➕ Ajouter</button>
            <button class="popup-button gray" onclick="displayHolidaysMenu()">Retour</button></div>`;
        document.getElementById('main-content').innerHTML = html;
        return;
    }
    const sortedHolidays = [...holidays].sort((a, b) => { const [mA, dA] = a.date.split('-').map(Number); const [mB, dB] = b.date.split('-').map(Number); if (mA !== mB) return mA - mB; return dA - dB; });
    const holidaysByMonth = {};
    sortedHolidays.forEach(h => { const [month, day] = h.date.split('-'); const monthName = MOIS_FRANCAIS[parseInt(month) - 1]; if (!holidaysByMonth[monthName]) holidaysByMonth[monthName] = []; holidaysByMonth[monthName].push({ day: parseInt(day), ...h }); });
    const typeLabels = { fixe: '📅 Fixe', religieux: '🕌 Religieux', national: '🇲🇦 National' };
    const typeColors = { fixe: '#27ae60', religieux: '#f39c12', national: '#3498db' };
    let html = `<div class="info-section"><h3>📋 Liste des Jours Fériés (${holidays.length} jours)</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;"><input type="text" id="searchHoliday" placeholder="🔍 Rechercher par description..." style="flex:1; padding:8px;" onkeyup="filterHolidaysList()">
        <button class="action-btn small green" onclick="showAddHolidayForm()">➕ Ajouter</button>
        <button class="action-btn small blue" onclick="generateYearlyHolidays()">🔄 Réinitialiser</button></div>
        <div id="holidaysListContainer"><div style="display:grid; gap:15px;">${Object.entries(holidaysByMonth).map(([monthName, days]) => `
            <div style="background:#2c3e50; border-radius:8px; overflow:hidden;"><div style="background:#34495e; padding:10px; font-weight:bold; border-bottom:1px solid #f39c12;">📅 ${monthName}</div>
            <table class="classement-table" style="width:100%; margin:0;"><thead><tr style="background-color:#2c3e50;"><th style="padding:8px; width:80px;">Date</th><th style="padding:8px;">Description</th><th style="padding:8px; width:100px;">Type</th><th style="padding:8px; width:80px;">Actions</th></tr></thead>
            <tbody>${days.sort((a, b) => a.day - b.day).map(h => `<tr style="border-bottom:1px solid #34495e;"><td style="padding:8px; text-align:center;"><strong>${h.day}</strong></th><td style="padding:8px;">🎉 ${h.description}</th>
            <td style="padding:8px; text-align:center;"><span style="background:${typeColors[h.type]}; color:white; padding:4px 8px; border-radius:12px;">${typeLabels[h.type]}</span></th>
            <td style="padding:8px; text-align:center;"><button class="action-btn small orange" onclick="modifyHoliday('${h.date}')">✏️</button><button class="action-btn small red" onclick="deleteHoliday('${h.date}')">🗑️</button></th></tr>`).join('')}</tbody></div>`).join('')}</div></div>
        <button class="popup-button gray" onclick="displayHolidaysMenu()" style="margin-top:15px;">↩️ Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function filterHolidaysList() {
    const term = document.getElementById('searchHoliday')?.value.toLowerCase() || '';
    if (!term) { showHolidaysList(); return; }
    const filtered = holidays.filter(h => h.description.toLowerCase().includes(term) || h.date.includes(term));
    if (filtered.length === 0) { document.getElementById('holidaysListContainer').innerHTML = `<div style="text-align:center; padding:20px; background:#2c3e50; border-radius:8px;"><p>🔍 Aucun jour férié trouvé pour "${term}"</p></div>`; return; }
    const filteredByMonth = {};
    filtered.forEach(h => { const [month, day] = h.date.split('-'); const monthName = MOIS_FRANCAIS[parseInt(month) - 1]; if (!filteredByMonth[monthName]) filteredByMonth[monthName] = []; filteredByMonth[monthName].push({ day: parseInt(day), ...h }); });
    const typeLabels = { fixe: '📅 Fixe', religieux: '🕌 Religieux', national: '🇲🇦 National' };
    const typeColors = { fixe: '#27ae60', religieux: '#f39c12', national: '#3498db' };
    let html = `<div style="display:grid; gap:15px;">`;
    for (const [monthName, days] of Object.entries(filteredByMonth)) {
        html += `<div style="background:#2c3e50; border-radius:8px; overflow:hidden;"><div style="background:#34495e; padding:10px; font-weight:bold;">📅 ${monthName}</div>
            <table class="classement-table" style="width:100%; margin:0;"><thead><tr style="background-color:#2c3e50;"><th>Date</th><th>Description</th><th>Type</th><th>Action</th></tr></thead>
            <tbody>${days.sort((a, b) => a.day - b.day).map(h => `<tr style="border-bottom:1px solid #34495e;"><td style="padding:8px;"><strong>${h.day}</strong></th><td style="padding:8px;">🎉 ${h.description}</th>
            <td style="padding:8px;"><span style="background:${typeColors[h.type]}; padding:2px 8px; border-radius:12px;">${typeLabels[h.type]}</span></th>
            <td style="padding:8px;"><button class="action-btn small orange" onclick="modifyHoliday('${h.date}')">✏️</button><button class="action-btn small red" onclick="deleteHoliday('${h.date}')">🗑️</button></th></tr>`).join('')}</tbody></div>`;
    }
    html += `</div>`;
    document.getElementById('holidaysListContainer').innerHTML = html;
}

function generateYearlyHolidays() {
    if (currentUser && currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayHolidaysMenu();
        return;
    }
    
    if (!checkPassword("Réinitialisation des jours fériés")) return;
    if (confirm("⚠️ Réinitialiser les jours fériés aux valeurs par défaut ?")) {
        initializeHolidays();
        saveData();
        showSnackbar("✅ Jours fériés réinitialisés");
        showHolidaysList();
    }
}

function showHolidaysCalendar() {
    const year = new Date().getFullYear();
    let html = `<div class="info-section"><h3>📅 Calendrier des Jours Fériés ${year}</h3>
        <div class="form-group"><label>Année</label><input type="number" id="calendarYear" class="form-input" value="${year}" onchange="refreshCalendar()"></div>
        <div id="calendarContainer">${generateCalendarHTML(year)}</div>
        <button class="popup-button gray" onclick="displayHolidaysMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function refreshCalendar() {
    const year = parseInt(document.getElementById('calendarYear').value);
    document.getElementById('calendarContainer').innerHTML = generateCalendarHTML(year);
}

function generateCalendarHTML(year) {
    let html = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:15px;">';
    for (let month = 1; month <= 12; month++) {
        const firstDay = new Date(year, month - 1, 1);
        const daysInMonth = new Date(year, month, 0).getDate();
        const startWeekday = firstDay.getDay();
        const monthHolidays = holidays.filter(h => parseInt(h.date.split('-')[0]) === month);
        html += `<div style="background:#34495e; border-radius:8px; padding:10px;">
            <h4 style="margin:0 0 10px 0; text-align:center; background:#2c3e50; padding:5px; border-radius:5px;">${MOIS_FRANCAIS[month-1]}</h4>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:3px; font-size:0.7em; text-align:center;">
                <div style="color:#e74c3c;">Dim</div><div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div style="color:#e74c3c;">Sam</div>`;
        for (let i = 0; i < startWeekday; i++) html += '<div style="opacity:0.3;">-</div>';
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = monthHolidays.some(h => parseInt(h.date.split('-')[1]) === day);
            const holidayInfo = monthHolidays.find(h => parseInt(h.date.split('-')[1]) === day);
            let dayStyle = isHoliday ? 'background:#f39c12; color:#2c3e50; font-weight:bold;' : (isWeekend ? 'background:#e74c3c; color:white;' : 'background:#2c3e50;');
            html += `<div style="${dayStyle} padding:5px; border-radius:3px;" title="${holidayInfo ? holidayInfo.description : ''}">${isHoliday ? '🎉' : ''}${day}</div>`;
        }
        html += `</div>`;
        if (monthHolidays.length > 0) html += `<div style="margin-top:8px; font-size:0.65em; color:#f39c12;">${monthHolidays.map(h => `📅 ${h.date.split('-')[1]}: ${h.description}`).join(' | ')}</div>`;
        html += `</div>`;
    }
    html += '</div>';
    return html;
}
function deleteHoliday(dateStr) {
    if (currentUser && currentUser.role !== 'ADMIN') {
        alert("⚠️ Action non autorisée");
        displayHolidaysMenu();
        return;
    }
    if (!checkPassword("Suppression jour férié")) return;

    if (!checkPassword("Suppression jour férié")) return;
    if (confirm(`Supprimer le jour férié du ${dateStr} ?`)) {
        holidays = holidays.filter(h => h.date !== dateStr);
        saveData();
        alert("✅ Jour férié supprimé!");
        showHolidaysList();
    }
}
function modifyHoliday(dateStr) {
    if (currentUser && currentUser.role !== 'ADMIN') {
        alert("⚠️ Action non autorisée");
        displayHolidaysMenu();
        return;
    }
    const holiday = holidays.find(h => h.date === dateStr);
    if (!holiday) return;
    const newDesc = prompt("Nouvelle description :", holiday.description);
    if (newDesc !== null && newDesc.trim()) holiday.description = newDesc;
    const newType = prompt("Nouveau type (fixe, religieux, national) :", holiday.type || "fixe");
    if (newType && ['fixe', 'religieux', 'national'].includes(newType)) holiday.type = newType;
    saveData();
    alert("✅ Jour férié modifié");
    showHolidaysList();
}
//   EXPORTATIONS ====================

function displayExportMenu() {
    displaySubMenu("EXPORTATIONS", [
        { text: "📤 Exporter Agents (CSV)", onclick: "exportAgentsCSV()" },
        { text: "📤 Exporter Planning (CSV)", onclick: "exportPlanningCSVForm()" },
        { text: "📄 Exporter Planning (PDF)", onclick: "exportPlanningPDF()" },
        { text: "📊 Exporter Planning (Excel)", onclick: "exportPlanningExcel()" },
        { text: "📤 Exporter Congés (CSV)", onclick: "exportLeavesCSV()" },
        { text: "💾 Sauvegarde Complète", onclick: "showBackupRestoreMenu()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function exportPlanningCSVForm() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const html = `<div class="info-section"><h3>📤 Export Planning CSV</h3>
        <div class="form-group"><label>Mois</label><select id="exportMonth" class="form-input">${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${MOIS_FRANCAIS[i]}</option>`).join('')}</select></div>
        <div class="form-group"><label>Année</label><input type="number" id="exportYear" class="form-input" value="${currentYear}"></div>
        <div class="form-group"><label>Groupe</label><select id="exportGroup" class="form-input"><option value="ALL">📋 Tous les groupes</option><option value="A">👥 Groupe A</option><option value="B">👥 Groupe B</option><option value="C">👥 Groupe C</option><option value="D">👥 Groupe D</option><option value="E">👥 Groupe E</option><option value="J">🃏 Jokers</option></select></div>
        <button class="popup-button green" onclick="exportPlanningCSV()">📥 Exporter</button>
        <button class="popup-button gray" onclick="displayExportMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function exportPlanningCSV() {
    const month = parseInt(document.getElementById('exportMonth').value);
    const year = parseInt(document.getElementById('exportYear').value);
    const group = document.getElementById('exportGroup').value;
    let actifs = agents.filter(a => a.statut === 'actif');
    if (group !== 'ALL') actifs = actifs.filter(a => a.groupe === group);
    const daysInMonth = new Date(year, month, 0).getDate();
    let csv = "Code;Nom;Prénom;Groupe";
    for (let d = 1; d <= daysInMonth; d++) csv += `;${d}`;
    csv += "\n";
    for (const agent of actifs) {
        csv += `${agent.code};${agent.nom};${agent.prenom};${agent.groupe}`;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
            csv += `;${getShiftForAgent(agent.code, dateStr)}`;
        }
        csv += "\n";
    }
    downloadCSV(csv, `planning_${getMonthName(month)}_${year}${group !== 'ALL' ? `_groupe${group}` : ''}.csv`);
}

function exportLeavesCSV() {
    let csv = "Agent;Code;Date début;Date fin;Type;Commentaire\n";
    Object.keys(planningData).forEach(monthKey => {
        Object.keys(planningData[monthKey]).forEach(agentCode => {
            if (!canAccessAgent(agentCode)) return;
            const leavesList = [];
            Object.keys(planningData[monthKey][agentCode]).forEach(dateStr => {
                const rec = planningData[monthKey][agentCode][dateStr];
                if (rec && ['C', 'M', 'A'].includes(rec.shift)) leavesList.push({ date: dateStr, type: rec.shift, comment: rec.comment });
            });
            const grouped = groupConsecutiveLeaves(leavesList.map(l => ({ ...l, agentCode })));
            const agent = agents.find(a => a.code === agentCode);
            grouped.forEach(g => {
                csv += `${agent ? agent.nom + ' ' + agent.prenom : agentCode};${agentCode};${g.startDate};${g.endDate};${g.type};${g.comment || ''}\n`;
            });
        });
    });
    downloadCSV(csv, `conges_${new Date().toISOString().split('T')[0]}.csv`);
}

function exportPlanningPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const actifs = getFilteredAgents();
    const daysInMonth = new Date(year, month, 0).getDate();
    doc.setFontSize(16);
    doc.text(`Planning - ${getMonthName(month)} ${year}`, 14, 10);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleString()}`, 14, 18);
    const headers = ['Agent', 'Groupe', ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
    const body = actifs.map(agent => {
        const row = [`${agent.nom} ${agent.prenom}`, agent.groupe];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            row.push(getShiftForAgent(agent.code, dateStr));
        }
        return row;
    });
    doc.autoTable({ head: [headers], body: body, startY: 25, theme: 'striped', styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [44, 62, 80] } });
    doc.save(`planning_${getMonthName(month)}_${year}.pdf`);
    showSnackbar("✅ PDF exporté");
}

function exportPlanningExcel() {
    if (typeof XLSX === 'undefined') { alert("⚠️ La bibliothèque SheetJS n'est pas chargée."); return; }
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const actifs = getFilteredAgents();
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = [['Code', 'Nom', 'Prénom', 'Groupe', ...Array.from({length: daysInMonth}, (_, i) => i + 1)]];
    for (const agent of actifs) {
        const row = [agent.code, agent.nom, agent.prenom, agent.groupe];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            row.push(getShiftForAgent(agent.code, dateStr));
        }
        data.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Planning ${getMonthName(month)} ${year}`);
    XLSX.writeFile(wb, `planning_${getMonthName(month)}_${year}.xlsx`);
    showSnackbar("✅ Excel exporté");
}

// = : CONFIGURATION ====================

function displayConfigMenu() {
    if (currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayMainMenu();
        return;
    }
    displaySubMenu("CONFIGURATION", [
        { text: "⚙️ Paramètres", onclick: "showSettings()" },
        { text: "🗃️ Gestion Base de Données", onclick: "showBackupRestoreMenu()" },
        { text: "📥 Importer Base CleanCo", onclick: "showImportCleanCoDatabase()" },
        { text: "ℹ️ À propos", onclick: "showAbout()" },
        { text: "↩️ Retour", onclick: "displayMainMenu()", className: "back-button" }
    ]);
}

function showSettings() {
    const html = `<div class="info-section"><h3>⚙️ Paramètres</h3>
        <div class="form-group"><label>🎨 Thème</label><select id="themeSelect" class="form-input" onchange="changeTheme()"><option value="dark" ${localStorage.getItem('theme') !== 'light' ? 'selected' : ''}>🌙 Sombre</option><option value="light" ${localStorage.getItem('theme') === 'light' ? 'selected' : ''}>☀️ Clair</option></select></div>
        <div class="form-group"><label>💾 Auto-sauvegarde</label><select id="autoSaveSelect" class="form-input"><option value="0">❌ Désactivée</option><option value="5">⏱️ Toutes les 5 minutes</option><option value="15">⏱️ Toutes les 15 minutes</option><option value="30">⏱️ Toutes les 30 minutes</option></select></div>
        <button class="popup-button green" onclick="saveSettings()">💾 Sauvegarder</button>
        <button class="popup-button gray" onclick="displayConfigMenu()">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
    const autoSaveValue = localStorage.getItem('autoSaveInterval') || '5';
    document.getElementById('autoSaveSelect').value = autoSaveValue;
}

function changeTheme() {
    const theme = document.getElementById('themeSelect').value;
    if (theme === 'light') {
        document.body.style.backgroundColor = '#ecf0f1';
        document.body.style.color = '#2c3e50';
        document.querySelectorAll('.card, .info-section, .stat-card, .planning-table, .classement-table').forEach(el => { if (el) el.style.backgroundColor = '#fff'; });
        document.querySelectorAll('.menu-button').forEach(el => { if (el) el.style.backgroundColor = '#3498db'; });
    } else {
        document.body.style.backgroundColor = '#2c3e50';
        document.body.style.color = '#ecf0f1';
        document.querySelectorAll('.card, .info-section, .stat-card, .planning-table, .classement-table').forEach(el => { if (el) el.style.backgroundColor = '#34495e'; });
        document.querySelectorAll('.menu-button').forEach(el => { if (el) el.style.backgroundColor = '#34495e'; });
    }
    localStorage.setItem('theme', theme);
}

function saveSettings() {
    const theme = document.getElementById('themeSelect').value;
    const autoSaveMinutes = parseInt(document.getElementById('autoSaveSelect').value);
    localStorage.setItem('theme', theme);
    localStorage.setItem('autoSaveInterval', autoSaveMinutes);
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (autoSaveMinutes > 0) {
        autoSaveInterval = setInterval(() => { saveData(); console.log("💾 Auto-save à", new Date().toLocaleTimeString()); }, autoSaveMinutes * 60 * 1000);
        showSnackbar(`✅ Auto-sauvegarde activée (toutes les ${autoSaveMinutes} min)`);
    } else { showSnackbar("⚠️ Auto-sauvegarde désactivée"); }
    changeTheme();
    displayConfigMenu();
}

function showBackupRestoreMenu() {
    const html = `<div class="info-section"><h3>💾 Sauvegarde & Restauration</h3>
        <div style="display:grid; gap:15px;">
            <div class="stat-card"><h4>📤 Exporter</h4><button class="popup-button blue" onclick="exportFullBackup()">📥 Sauvegarde JSON</button><button class="popup-button green" onclick="exportAgentsCSV()">📊 Agents CSV</button></div>
            <div class="stat-card"><h4>📥 Importer</h4><input type="file" id="restoreFile" accept=".json" style="margin-bottom:10px;"><button class="popup-button green" onclick="importFullBackup()">📥 Restaurer</button></div>
            <div class="stat-card"><h4>🔄 Réinitialisation</h4><button class="popup-button orange" onclick="resetToDemoData()">🎮 Données démo</button><button class="popup-button red" onclick="clearAllDataPrompt()">🗑️ Effacer tout</button></div>
            <div class="stat-card"><h4>🔧 Utilitaires</h4><button class="popup-button blue" onclick="createCPAccountsFromAgents()">🔧 Créer comptes CP</button></div>
        </div>
        <div style="margin-top:15px; background:#2c3e50; padding:10px; border-radius:8px;"><h4>📊 État actuel</h4><div>👥 Agents: ${agents.length}</div><div>📅 Planning: ${Object.keys(planningData).length} mois</div><div>📻 Radios: ${radios.length}</div><div>⚠️ Avertissements: ${warnings.length}</div><div>🎉 Jours fériés: ${holidays.length}</div></div>
        <button class="popup-button gray" onclick="displayConfigMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function exportFullBackup() {
    const backup = { exportDate: new Date().toISOString(), version: "8.0", agents, planningData, holidays, panicCodes, radios, uniforms, warnings, replacementNotifications, users, notifications };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sga_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    showSnackbar("✅ Sauvegarde complète exportée");
}

function importFullBackup() {
    const fileInput = document.getElementById('restoreFile');
    if (!fileInput || !fileInput.files.length) { alert("⚠️ Sélectionnez un fichier JSON"); return; }
    if (!checkPassword("Restauration")) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (confirm("⚠️ Remplacer toutes les données actuelles ?")) {
                if (data.agents) agents = data.agents;
                if (data.planningData) planningData = data.planningData;
                if (data.holidays) holidays = data.holidays;
                if (data.panicCodes) panicCodes = data.panicCodes;
                if (data.radios) radios = data.radios;
                if (data.uniforms) uniforms = data.uniforms;
                if (data.warnings) warnings = data.warnings;
                if (data.replacementNotifications) replacementNotifications = data.replacementNotifications;
                if (data.users) users = data.users;
                if (data.notifications) notifications = data.notifications;
                saveData();
                alert("✅ Données restaurées avec succès !");
                displayMainMenu();
            }
        } catch (err) { alert("❌ Fichier invalide ou corrompu"); }
    };
    reader.readAsText(fileInput.files[0]);
}

function showImportCleanCoDatabase() {
    const html = `<div class="info-section"><h3>📥 Importer Base CleanCo 2026</h3>
        <p>Cette option permet d'importer la base de données complète des agents CleanCo.</p>
        <div class="form-group"><label>Fichier data.js (base CleanCo)</label><input type="file" id="cleancoDataFile" accept=".js" class="form-input"><small style="color:#bdc3c7;">Sélectionnez le fichier "b-d Cleanco 2026.js"</small></div>
        <div class="form-group"><label>Mode d'import</label><select id="importCleanCoMode" class="form-input"><option value="replace">🔄 Remplacer tous les agents</option><option value="merge">➕ Fusionner (ajouter les nouveaux codes)</option></select></div>
        <button class="popup-button green" onclick="importCleanCoData()">📥 Importer CleanCo</button>
        <button class="popup-button gray" onclick="displayConfigMenu()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function importCleanCoData() {
    const fileInput = document.getElementById('cleancoDataFile');
    if (!fileInput || !fileInput.files.length) { alert("⚠️ Sélectionnez le fichier data.js de CleanCo"); return; }
    if (!checkPassword("Import base CleanCo")) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        let importedAgents = null;
        try {
            const match = content.match(/const\s+agents\s*=\s*(\[[\s\S]*?\]);/);
            if (match) { importedAgents = eval(match[1]); } 
            else { const match2 = content.match(/var\s+agents\s*=\s*(\[[\s\S]*?\]);/); if (match2) importedAgents = eval(match2[1]); else throw new Error('Format non reconnu'); }
            if (!importedAgents || !Array.isArray(importedAgents)) throw new Error('Le fichier ne contient pas un tableau agents valide');
            const mode = document.getElementById('importCleanCoMode').value;
            let count = 0;
            if (mode === 'replace') { agents = importedAgents; count = agents.length; showSnackbar(`✅ ${count} agents importés (remplacement)`); } 
            else { const existingCodes = new Set(agents.map(a => a.code)); importedAgents.forEach(agent => { if (!existingCodes.has(agent.code)) { agents.push(agent); count++; } }); showSnackbar(`✅ ${count} nouveaux agents ajoutés (fusion)`); }
            createCPAccountsFromAgents();
            saveData();
            alert(`✅ Import terminé ! ${agents.length} agents au total.`);
            displayConfigMenu();
        } catch (err) { console.error(err); alert("❌ Erreur: fichier data.js invalide ou variable 'agents' non trouvée\n" + err.message); }
    };
    reader.onerror = () => alert("❌ Erreur de lecture du fichier");
    reader.readAsText(file, 'UTF-8');
}

function createCPAccountsFromAgents() {
    const cpAgents = agents.filter(a => a.code && (a.code === 'CPA' || a.code === 'CPB' || a.code === 'CPC' || a.code === 'CPD'));
    let created = 0;
    cpAgents.forEach(agent => {
        const existingUser = users.find(u => u.agentCode === agent.code);
        if (!existingUser) {
            const username = agent.code.toLowerCase();
            const newUser = { id: Date.now() + Math.random(), username: username, password: agent.code.toUpperCase() + "123", role: "CP", nom: agent.nom, prenom: agent.prenom, groupe: agent.groupe, agentCode: agent.code };
            users.push(newUser);
            created++;
            console.log(`✅ Compte CP créé: ${username} / mot de passe: ${agent.code.toUpperCase()}123`);
        }
    });
    if (created > 0) { saveData(); showSnackbar(`✅ ${created} comptes CP créés automatiquement`); }
}

function resetToDemoData() {
    if (!checkPassword("Réinitialisation")) return;
    if (confirm("🔄 Charger les données de démo ?\n⚠️ Toutes les données actuelles seront perdues !")) {
        agents = [
            { code: 'DEMO01', nom: 'Admin', prenom: 'Test', groupe: 'A', tel: '0612345678', statut: 'actif', date_entree: new Date().toISOString().split('T')[0] },
            { code: 'DEMO02', nom: 'Joker', prenom: 'Un', groupe: 'J', tel: '0645678901', statut: 'actif', date_entree: new Date().toISOString().split('T')[0] },
            { code: 'DEMO03', nom: 'Agent', prenom: 'Test', groupe: 'B', tel: '0634567890', statut: 'actif', date_entree: new Date().toISOString().split('T')[0] }
        ];
        planningData = {}; holidays = []; panicCodes = []; radios = []; uniforms = []; warnings = []; replacementNotifications = []; notifications = [];
        initializeHolidays();
        saveData();
        alert("✅ Données de démo chargées !");
        displayMainMenu();
    }
}

function clearAllDataPrompt() {
    if (!checkPassword("Effacement total")) return;
    if (confirm("⚠️⚠️⚠️ EFFACEMENT TOTAL ⚠️⚠️⚠️\n\nToutes les données seront définitivement supprimées !")) {
        if (confirm("DERNIER AVERTISSEMENT - Êtes-vous absolument sûr ?")) {
            localStorage.clear();
            agents = []; planningData = {}; holidays = []; panicCodes = []; radios = []; uniforms = []; warnings = []; replacementNotifications = []; notifications = [];
            users = [
                { id: 1, username: "admin", password: "NABIL1974", role: "ADMIN", nom: "Admin", prenom: "Système", groupe: null, agentCode: null },
                { id: 2, username: "cp_a", password: "CPA123", role: "CP", nom: "OUKHA", prenom: "NABIL", groupe: "A", agentCode: "CPA" },
            ];
            initializeHolidays();
            saveData();
            alert("✅ Toutes les données ont été effacées");
            displayMainMenu();
        }
    }
}

function showAbout() {
    const html = `<div class="info-section"><h3>ℹ️ À propos</h3>
        <div style="text-align:center"><h2>🏢 SGA - Système de Gestion des Agents</h2><p><strong>Version 8.0 - CleanCo</strong></p>
        <hr style="margin:15px 0;"><p>👑 <strong>Administrateur:</strong> admin / NABIL1974</p>
        <p>👥 <strong>Chef Patrouille A:</strong> cp_a / CPA123</p><p>👤 <strong>Agent exemple:</strong> agent_a001 / AGENT123</p>
        <hr style="margin:15px 0;"><p>📥 Import base CleanCo disponible dans Configuration</p><p>🔄 Gestion des congés avec remplacement automatique par joker</p>
        <p>📅 Planning avec jours fériés et numéros de semaine</p><hr style="margin:15px 0;"><p>© 2026 - CleanCo | Tous droits réservés</p>
        <p style="font-size:0.8rem; color:#bdc3c7;">Développé par Oukha Nabil</p></div>
        <button class="popup-button gray" onclick="displayConfigMenu()" style="margin-top:15px;">Fermer</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}
// ==================== PARTIE 17 : GESTION UTILISATEURS ====================
// Conservez vos fonctions existantes (showUsersManagement, etc.)

// : GESTION UTILISATEURS ====================

function showUsersManagement() {
    if (currentUser.role !== 'ADMIN') {
        alert("⚠️ Accès réservé à l'administrateur");
        displayMainMenu();
        return;
    }
    let html = `<div class="info-section"><h3>👥 Gestion des Utilisateurs</h3>
        <div style="margin-bottom:20px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="popup-button green" onclick="showAddUserForm()">➕ Ajouter un utilisateur</button>
            <button class="popup-button blue" onclick="createCPAccountsFromAgents()">🔧 Créer comptes CP</button>
        </div>
        <div style="overflow-x:auto;"><table class="classement-table"><thead><tr style="background-color:#34495e;"><th>Utilisateur</th><th>Nom</th><th>Prénom</th><th>Rôle</th><th>Groupe</th><th>Agent lié</th><th>Actions</th></tr></thead>
        <tbody>${users.map(u => {
            const agent = u.agentCode ? agents.find(a => a.code === u.agentCode) : null;
            const roleLabels = { 'ADMIN': '👑 Administrateur', 'CP': '👥 Chef Patrouille', 'AGENT': '👤 Agent' };
            return `<tr style="border-bottom:1px solid #34495e;"><td><strong>${u.username}</strong></td><td>${u.nom}</td><td>${u.prenom}</td>
            <td>${roleLabels[u.role] || u.role}</td><td style="text-align:center;">${u.groupe || '-'}</td>
            <td>${u.agentCode ? `${u.agentCode} (${agent ? agent.nom : '?'})` : '-'}</td>
            <td style="white-space:nowrap;"><button class="action-btn small blue" onclick="editUser(${u.id})" title="Modifier">✏️</button>
            <button class="action-btn small orange" onclick="resetUserPassword(${u.id})" title="Réinitialiser mot de passe">🔑</button>
            ${u.username !== 'admin' ? `<button class="action-btn small red" onclick="deleteUser(${u.id})" title="Supprimer">🗑️</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
        <button class="popup-button gray" onclick="displayMainMenu()" style="margin-top:15px;">Retour</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function showAddUserForm() {
    const agentsList = agents.filter(a => a.statut === 'actif');
    const html = `<div class="info-section"><h3>➕ Ajouter un utilisateur</h3>
        <div class="form-group"><label>Nom d'utilisateur *</label><input type="text" id="newUsername" class="form-input" placeholder="ex: agent_a001"></div>
        <div class="form-group"><label>Mot de passe *</label><input type="password" id="newPassword" class="form-input" placeholder="Minimum 4 caractères"></div>
        <div class="form-group"><label>Nom</label><input type="text" id="newUserNom" class="form-input"></div>
        <div class="form-group"><label>Prénom</label><input type="text" id="newUserPrenom" class="form-input"></div>
        <div class="form-group"><label>Rôle *</label><select id="newUserRole" class="form-input" onchange="toggleUserRoleFields()">
            <option value="ADMIN">👑 Administrateur</option><option value="CP">👥 Chef de Patrouille</option><option value="AGENT">👤 Agent</option></select></div>
        <div id="userGroupField" style="display:none;"><div class="form-group"><label>Groupe</label><select id="newUserGroup" class="form-input"><option value="A">Groupe A</option><option value="B">Groupe B</option><option value="C">Groupe C</option><option value="D">Groupe D</option><option value="E">Groupe E</option></select></div></div>
        <div id="userAgentField" style="display:none;"><div class="form-group"><label>Agent lié</label><select id="newUserAgent" class="form-input"><option value="">-- Sélectionner un agent --</option>${agentsList.map(a => `<option value="${a.code}">${a.code} - ${a.nom} ${a.prenom} (Groupe ${a.groupe})</option>`).join('')}</select></div></div>
        <button class="popup-button green" onclick="addUser()">💾 Créer</button>
        <button class="popup-button gray" onclick="showUsersManagement()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function toggleUserRoleFields() {
    const role = document.getElementById('newUserRole').value;
    document.getElementById('userGroupField').style.display = role === 'CP' ? 'block' : 'none';
    document.getElementById('userAgentField').style.display = role === 'AGENT' ? 'block' : 'none';
}

function addUser() {
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const nom = document.getElementById('newUserNom').value;
    const prenom = document.getElementById('newUserPrenom').value;
    const role = document.getElementById('newUserRole').value;
    if (!username || !password) { alert("⚠️ Nom d'utilisateur et mot de passe requis"); return; }
    if (password.length < 4) { alert("⚠️ Le mot de passe doit contenir au moins 4 caractères"); return; }
    if (users.find(u => u.username === username)) { alert("⚠️ Ce nom d'utilisateur existe déjà"); return; }
    const newUser = { id: Date.now(), username, password, role, nom: nom || username, prenom: prenom || '', groupe: null, agentCode: null };
    if (role === 'CP') { newUser.groupe = document.getElementById('newUserGroup').value; } 
    else if (role === 'AGENT') {
        newUser.agentCode = document.getElementById('newUserAgent').value;
        const agent = agents.find(a => a.code === newUser.agentCode);
        if (agent) { newUser.nom = agent.nom; newUser.prenom = agent.prenom; }
    }
    users.push(newUser);
    saveData();
    alert(`✅ Utilisateur ${username} créé avec succès`);
    showUsersManagement();
}

function editUser(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const agentsList = agents.filter(a => a.statut === 'actif');
    const html = `<div class="info-section"><h3>✏️ Modifier l'utilisateur ${user.username}</h3>
        <div class="form-group"><label>Nom</label><input type="text" id="editUserNom" value="${user.nom}" class="form-input"></div>
        <div class="form-group"><label>Prénom</label><input type="text" id="editUserPrenom" value="${user.prenom}" class="form-input"></div>
        <div class="form-group"><label>Rôle</label><select id="editUserRole" class="form-input" onchange="toggleEditUserRoleFields()">
            <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>👑 Administrateur</option>
            <option value="CP" ${user.role === 'CP' ? 'selected' : ''}>👥 Chef de Patrouille</option>
            <option value="AGENT" ${user.role === 'AGENT' ? 'selected' : ''}>👤 Agent</option></select></div>
        <div id="editUserGroupField" style="display:${user.role === 'CP' ? 'block' : 'none'};"><div class="form-group"><label>Groupe</label><select id="editUserGroup" class="form-input"><option value="A" ${user.groupe === 'A' ? 'selected' : ''}>Groupe A</option><option value="B" ${user.groupe === 'B' ? 'selected' : ''}>Groupe B</option><option value="C" ${user.groupe === 'C' ? 'selected' : ''}>Groupe C</option><option value="D" ${user.groupe === 'D' ? 'selected' : ''}>Groupe D</option><option value="E" ${user.groupe === 'E' ? 'selected' : ''}>Groupe E</option></select></div></div>
        <div id="editUserAgentField" style="display:${user.role === 'AGENT' ? 'block' : 'none'};"><div class="form-group"><label>Agent lié</label><select id="editUserAgent" class="form-input"><option value="">-- Aucun --</option>${agentsList.map(a => `<option value="${a.code}" ${user.agentCode === a.code ? 'selected' : ''}>${a.code} - ${a.nom} ${a.prenom}</option>`).join('')}</select></div></div>
        <button class="popup-button green" onclick="updateUser(${id})">💾 Enregistrer</button>
        <button class="popup-button gray" onclick="showUsersManagement()">Annuler</button>
    </div>`;
    document.getElementById('main-content').innerHTML = html;
}

function toggleEditUserRoleFields() {
    const role = document.getElementById('editUserRole').value;
    document.getElementById('editUserGroupField').style.display = role === 'CP' ? 'block' : 'none';
    document.getElementById('editUserAgentField').style.display = role === 'AGENT' ? 'block' : 'none';
}

function updateUser(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    user.nom = document.getElementById('editUserNom').value;
    user.prenom = document.getElementById('editUserPrenom').value;
    user.role = document.getElementById('editUserRole').value;
    if (user.role === 'CP') { user.groupe = document.getElementById('editUserGroup').value; user.agentCode = null; } 
    else if (user.role === 'AGENT') {
        user.agentCode = document.getElementById('editUserAgent').value;
        user.groupe = null;
        const agent = agents.find(a => a.code === user.agentCode);
        if (agent && (!user.nom || user.nom === user.username)) { user.nom = agent.nom; user.prenom = agent.prenom; }
    } else { user.groupe = null; user.agentCode = null; }
    saveData();
    alert(`✅ Utilisateur ${user.username} modifié`);
    showUsersManagement();
}

function deleteUser(id) {
    if (!checkPassword("Suppression d'utilisateur")) return;
    const user = users.find(u => u.id === id);
    if (!user) return;
    if (user.username === 'admin') { alert("⚠️ Impossible de supprimer l'administrateur principal"); return; }
    if (user.id === currentUser.id) { alert("⚠️ Vous ne pouvez pas supprimer votre propre compte"); return; }
    if (confirm(`Supprimer définitivement l'utilisateur ${user.username} ?`)) {
        users = users.filter(u => u.id !== id);
        saveData();
        alert("✅ Utilisateur supprimé");
        showUsersManagement();
    }
}

function resetUserPassword(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const newPassword = prompt(`Nouveau mot de passe pour ${user.username} :\n(minimum 4 caractères)`);
    if (newPassword && newPassword.length >= 4) {
        user.password = newPassword;
        if (currentUser.id === id) currentUser.password = newPassword;
        saveData();
        alert(`✅ Mot de passe de ${user.username} modifié avec succès`);
        showUsersManagement();
    } else if (newPassword) { alert("❌ Le mot de passe doit contenir au moins 4 caractères"); }
}
// ==================== PARTIE 18 : INITIALISATION (tout à la fin) ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 SGA v8.0 - CleanCo - Démarrage...");
    await loadData();  // <- maintenant autorisé car la fonction callback est async
    loadNotifications();
    const savedUser = localStorage.getItem('sga_current_user');
    if (savedUser) {
        const userData = JSON.parse(savedUser);
        currentUser = users.find(u => u.id === userData.id);
    }
    if (currentUser) {
        const header = document.querySelector('.app-header');
        if (header && !document.querySelector('.user-info')) {
            const userInfoDiv = document.createElement('div');
            userInfoDiv.className = 'user-info';
            userInfoDiv.style.cssText = 'margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;';
            userInfoDiv.innerHTML = `<div id="notificationIcon" style="position:relative; cursor:pointer;"><span style="font-size:1.5rem;">🔔</span><span id="notificationBadge" style="position:absolute; top:-8px; right:-8px; background:#e74c3c; color:white; border-radius:50%; padding:2px 6px; font-size:0.7rem; font-weight:bold; display:none;">0</span></div>
                <span style="background:#f39c12; padding:4px 12px; border-radius:20px; font-size:0.8rem; color:#2c3e50;">${currentUser.role === 'ADMIN' ? '👑 Admin' : (currentUser.role === 'CP' ? '👥 CP Groupe ' + currentUser.groupe : '👤 Agent')}</span>
                <span style="color:white;">${currentUser.nom} ${currentUser.prenom}</span>
                <button class="logout-btn" onclick="logout()" style="background:#e74c3c; border:none; padding:5px 12px; border-radius:20px; color:white; cursor:pointer;">🚪 Déconnexion</button>`;
            header.appendChild(userInfoDiv);
            attachNotificationClick();
        }
        updateNotificationBadge();
        displayMainMenu();
    } else {
        showLogin();
    }
});
function refreshAllTotals() {
    // Recalculer les soldes pour tous les agents concernés
    // Cela va forcer une remise à jour des statistiques
    console.log("Recalcul des totaux...");
    // Si vous avez une fonction de recalcul global, appelez-la ici.
    // Sinon, on peut simplement recharger la vue actuelle.
    // Mais pour l'instant, on laisse vide, le problème viendra d'ailleurs.
}

// Rendre les fonctions globales nécessaires
window.showNotificationsPanel = showNotificationsPanel;
window.attachNotificationClick = attachNotificationClick;
window.updateNotificationBadge = updateNotificationBadge;
window.afficherSoldesAgent = afficherSoldesAgent;
window.afficherDetailMensuelConges = afficherDetailMensuelConges;
window.setPrisManuel = setPrisManuel;
window.ajouterJourConge = ajouterJourConge;
window.supprimerUnJourConge = supprimerUnJourConge;