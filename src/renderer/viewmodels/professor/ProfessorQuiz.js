/**
 * ViewModel : ProfessorVM (AI Quiz Generation & Management)
 */
Object.assign(ProfVM, {
    quizQuestions: [],
    selectedQuizType: 'QCM',

    toggleQuizType(el) {
        document.querySelectorAll('.quiz-type-chip').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedQuizType = el.getAttribute('data-type');
    },

    openAIModal() {
        document.getElementById('aiFileInput').value = '';
        document.getElementById('aiTextInput').value = '';
        document.getElementById('aiLoading').style.display = 'none';
        document.getElementById('aiModal').classList.add('open');
    },

    closeAIModal() { document.getElementById('aiModal')?.classList.remove('open'); },

    async handleAIFiles(input) {
        const file = input.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = '';
            if (ext === 'txt') text = e.target.result;
            else if (ext === 'pdf') {
                const pdfData = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(' ') + '\n';
                }
            } else { alert("Format non supporté pour l'extraction auto (utiliser .txt ou .pdf). Pour Word/PPT, copiez-collez le texte."); return; }
            document.getElementById('aiTextInput').value = text;
        };
        if (ext === 'txt') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    },

    async generateAIQuiz() {
        const text = document.getElementById('aiTextInput').value.trim();
        const count = parseInt(document.getElementById('aiQuestionCount').value) || 5;
        if (!text) { alert("Veuillez fournir du texte ou un fichier."); return; }
        const loading = document.getElementById('aiLoading'); if (loading) loading.style.display = 'block';
        try {
            const TOGETHER_API_KEY = '5a66996d910777598c47492c906000780f2be61f7d432742918df9a805720c22';
            const prompt = `Génère un QCM de ${count} questions à partir du texte suivant. 
            Format JSON uniquement : [{"question": "...", "options": ["...", "..."], "correctAnswer": 0}].
            Texte : ${text.substring(0, 4000)}`;
            const resp = await fetch('https://api.together.xyz/v1/chat/completions', {
                method: 'POST', headers: { 'Authorization': `Bearer ${TOGETHER_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'meta-llama/Llama-3-8b-chat-hf', messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
            });
            const data = await resp.json();
            const content = data.choices[0].message.content;
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const questions = JSON.parse(jsonMatch[0]);
                this.quizQuestions = questions;
                this.renderQuizQuestions();
                this.closeAIModal();
                this.setMode('nouveau');
            } else throw new Error("Format JSON non trouvé.");
        } catch(e) { alert("Erreur génération IA: " + e.message); }
        finally { if (loading) loading.style.display = 'none'; }
    },

    addQuizQuestion() {
        const q = { question: "Nouvelle question", options: ["Option 1", "Option 2"], correctAnswer: 0 };
        this.quizQuestions.push(q);
        this.renderQuizQuestions();
    },

    removeQuizQuestion(idx) {
        this.quizQuestions.splice(idx, 1);
        this.renderQuizQuestions();
    },

    renderQuizQuestions() {
        const el = document.getElementById('quizQuestionsList'); if (!el) return;
        el.innerHTML = this.quizQuestions.map((q, i) => `
            <div class="quiz-q-item">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>Question ${i + 1}</strong>
                    <button onclick="ProfVM.removeQuizQuestion(${i})" style="color:#ed4245; background:none; border:none; cursor:pointer;">Supprimer</button>
                </div>
                <input type="text" value="${_escapeHtml(q.question)}" onchange="ProfVM.quizQuestions[${i}].question = this.value" style="width:100%; margin-bottom:8px; padding:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#fff;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    ${q.options.map((opt, oi) => `<input type="text" value="${_escapeHtml(opt)}" onchange="ProfVM.quizQuestions[${i}].options[${oi}] = this.value" style="padding:4px; font-size:11px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:4px;">`).join('')}
                </div>
            </div>
        `).join('');
    }
});
