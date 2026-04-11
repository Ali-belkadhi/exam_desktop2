window.QuizVM = {
    questions: [],
    answers: {},
    isSubmitted: false,

    init() {
        this.sync();

        // Listen for data updates (e.g. from heartbeats)
        window.addEventListener('session-updated', () => {
            if (!this.isSubmitted) this.sync();
        });
    },

    sync() {
        // Fallback: search in sessionStorage
        const quizDataStr = sessionStorage.getItem('sessionQuizData');
        const testType = sessionStorage.getItem('sessionTestType');
        
        if (!quizDataStr) {
            if (testType === 'QUIZ') this.renderEmpty('Chargement des questions...');
            return;
        }

        try {
            let quizData = JSON.parse(quizDataStr);
            // Handle double-serialized JSON common with some backend storage
            if (typeof quizData === 'string') {
                quizData = JSON.parse(quizData);
            }
            
            const newQuestions = quizData.questions || [];
            
            // Only update and re-render if questions have changed or were empty
            if (this.questions.length === 0 || JSON.stringify(this.questions) !== JSON.stringify(newQuestions)) {
                this.questions = newQuestions;
                
                if (this.questions.length > 0) {
                    this.render();
                } else {
                    this.renderEmpty('Aucune question trouvée dans ce quiz.');
                }
                
                if (testType === 'QUIZ') {
                    const tbQuiz = document.getElementById('tb-quiz');
                    if (tbQuiz) tbQuiz.style.display = 'flex';
                    
                    // Auto-open window once
                    if (!this._hasOpenedOnce) {
                        if (window.UI && window.UI.openWindow) {
                            window.UI.openWindow('win-quiz');
                            this._hasOpenedOnce = true;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[QuizVM] Sync error:', e);
            this.renderEmpty('Erreur de lecture des données du quiz.');
        }
    },

    renderEmpty(msg) {
        const container = document.getElementById('quiz-container');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4);">
                <div style="font-size:32px; margin-bottom:10px;">📋</div>
                <p>${msg}</p>
            </div>`;
        }
    },

    render() {
        const container = document.getElementById('quiz-container');
        if (!container) return;

        if (this.isSubmitted) {
            this.renderResult(container);
            return;
        }

        if (this.questions.length === 0) {
            this.renderEmpty('Aucune question à afficher.');
            return;
        }

        container.innerHTML = this.questions.map((q, idx) => {
            let optionsHtml = '';
            if (q.type === 'QCM') {
                optionsHtml = (q.options || []).map((opt, oIdx) => `
                    <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer;">
                        <input type="checkbox" onchange="QuizVM.setAnswer('${q.id}', '${oIdx}', this.checked)" style="width:18px; height:18px;">
                        <span>${opt}</span>
                    </label>
                `).join('');
            } else if (q.type === 'QCMImage') {
                optionsHtml = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 15px; margin-top: 10px;">` + 
                (q.options || []).map((opt, oIdx) => `
                    <label style="display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); transition: transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='rgba(88,101,242,0.5)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.transform='none'">
                        ${opt ? `<img src="${opt}" style="max-height: 100px; width: 100%; object-fit: contain; border-radius: 6px;"/>` : `<div style="height:100px; width:100%; background:rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; font-size:11px; color:rgba(255,255,255,0.3); border-radius: 6px;">Aucune image</div>`}
                        <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
                            <input type="checkbox" onchange="QuizVM.setAnswer('${q.id}', '${oIdx}', this.checked)" style="width:18px; height:18px;">
                            <span style="font-size:13px; font-weight:600;">Choix ${oIdx + 1}</span>
                        </div>
                    </label>
                `).join('') + `</div>`;
            } else if (q.type === 'VraiFaux') {
                optionsHtml = `
                    <div style="display:flex; gap:24px;">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="radio" name="q_${q.id}" onchange="QuizVM.setAnswer('${q.id}', 'Vrai')" style="width:18px; height:18px;"> Vrai
                        </label>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="radio" name="q_${q.id}" onchange="QuizVM.setAnswer('${q.id}', 'Faux')" style="width:18px; height:18px;"> Faux
                        </label>
                    </div>
                `;
            } else if (q.type === 'Libre') {
                optionsHtml = `<textarea style="width:100%; height:80px; padding:10px; border-radius:8px; background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.1);" placeholder="Saisissez votre réponse..." oninput="QuizVM.setAnswer('${q.id}', this.value)"></textarea>`;
            } else if (q.type === 'Classement') {
                optionsHtml = `
                    <div style="font-size:12px; color:rgba(255,255,255,0.4); margin-bottom:10px;">Indiquez l'ordre correct en séparant par des virgules (ex: 1,3,2,4) pour les éléments suivants:</div>
                    <div style="margin-bottom:10px;">
                        ${(q.options || []).map((opt, oIdx) => `<div style="padding:4px 0;">${oIdx + 1}. ${opt}</div>`).join('')}
                    </div>
                    <input type="text" placeholder="Ordre (ex: 2,1,3)" style="width:100%; height:36px; padding:0 12px; border-radius:8px; background:rgba(0,0,0,0.1); border:1px solid rgba(255,255,255,0.1); color:#fff;" oninput="QuizVM.setAnswer('${q.id}', this.value)">
                `;
            }

            return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:15px; padding:20px; margin-bottom:20px;">
                    <div style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:10px;">Question ${idx + 1} <span style="font-weight:400; color:rgba(255,255,255,0.4); margin-left:10px;">(${q.points || 1} points)</span></div>
                    <div style="font-size:16px; font-weight:600; margin-bottom:15px; line-height:1.4;">${q.text || 'Question sans texte'}</div>
                    <div class="options-container">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        }).join('');
    },

    setAnswer(qId, val, isChecked) {
        if (isChecked === undefined) {
            // Radio or Text or Classement
            this.answers[qId] = val;
        } else {
            // Checkbox (QCM)
            if (!this.answers[qId]) this.answers[qId] = [];
            if (isChecked) {
                if (!this.answers[qId].includes(val)) this.answers[qId].push(val);
            } else {
                this.answers[qId] = this.answers[qId].filter(v => v !== val);
            }
        }
    },

    async submitQuiz() {
        if (!confirm('Êtes-vous sûr de vouloir terminer le quiz ?')) return;

        let totalScore = 0;
        let maxScore = 0;

        this.questions.forEach(q => {
            maxScore += q.points;
            let userAnswer = this.answers[q.id];
            if (q.type === 'QCM') {
                const correct = q.correctAnswers || [];
                const user = userAnswer || [];
                if (correct.length === user.length && correct.every(v => user.includes(v))) totalScore += q.points;
            } else if (q.type === 'VraiFaux') {
                if (userAnswer === q.correctAnswers[0]) totalScore += q.points;
            } else if (q.type === 'Libre') {
                totalScore += q.points;
            } else if (q.type === 'Classement') {
                const userOrder = (userAnswer || '').split(',').map(s => s.trim());
                const correctOrderIndices = q.options.map((_, i) => (i + 1).toString());
                if (JSON.stringify(userOrder) === JSON.stringify(correctOrderIndices)) totalScore += q.points;
            }
        });

        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const API_BASE = localStorage.getItem('apiBase') || 'https://safe-exam-db.onrender.com';

        const payload = {
            testId,
            studentId,
            score: totalScore,
            maxScore,
            answers: this.answers
        };

        try {
            // Use WebSocket for real-time notification to professor if available
            if (window.sessionVM && window.sessionVM.socket && window.sessionVM.socket.connected) {
                window.sessionVM.socket.emit('submitQuiz', payload);
                console.log('[QuizVM] Submitted via WebSocket');
            } else {
                await fetch(`${API_BASE}/practical-tests/${testId}/submit-quiz`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                console.log('[QuizVM] Submitted via HTTP');
            }
        } catch (e) {
            console.error('[QuizVM] Submit score failed:', e);
        }

        this.isSubmitted = true;
        this.render();
    },

    renderResult(container) {
        let totalScore = 0;
        let maxScore = 0;

        const resultsHtml = this.questions.map((q, idx) => {
            maxScore += q.points;
            let userAnswer = this.answers[q.id];
            let isCorrect = false;
            let score = 0;

            if (q.type === 'QCM' || q.type === 'QCMImage') {
                // Check if arrays have same elements
                const correct = q.correctAnswers || [];
                const user = userAnswer || [];
                if (correct.length === user.length && correct.every(v => user.includes(v))) {
                    isCorrect = true;
                    score = q.points;
                }
            } else if (q.type === 'VraiFaux') {
                if (userAnswer === q.correctAnswers[0]) {
                    isCorrect = true;
                    score = q.points;
                }
            } else if (q.type === 'Libre') {
                // Manual correction needed but for now let's just say it's submitted
                isCorrect = true;
                score = q.points; // Give points for free text for demo
            } else if (q.type === 'Classement') {
                // Check order
                const userOrder = (userAnswer || '').split(',').map(s => s.trim());
                const correctOrderIndices = q.options.map((_, i) => (i + 1).toString());
                if (JSON.stringify(userOrder) === JSON.stringify(correctOrderIndices)) {
                    isCorrect = true;
                    score = q.points;
                }
            }

            totalScore += score;

            return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid ${isCorrect ? 'rgba(35, 209, 96, 0.3)' : 'rgba(237, 66, 69, 0.3)'}; border-radius:15px; padding:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:14px; font-weight:700; color:var(--primary);">Question ${idx + 1}</span>
                        <span style="font-weight:700; color:${isCorrect ? '#23d160' : '#ed4245'};">${score}/${q.points} pts</span>
                    </div>
                    <div style="font-size:15px; margin-bottom:10px;">${q.text}</div>
                    <div style="font-size:13px; color:rgba(255,255,255,0.4);">
                        Votre réponse: <span style="color:#fff;">${Array.isArray(userAnswer) ? userAnswer.map(a => (q.type === 'QCMImage' ? 'Choix ' + (parseInt(a) + 1) : a)).join(', ') : (userAnswer || '—')}</span>
                    </div>
                    ${!isCorrect ? `<div style="font-size:13px; color:#23d160; margin-top:5px;">Réponse correcte: ${Array.isArray(q.correctAnswers) ? q.correctAnswers.map(a => (q.type === 'QCMImage' ? 'Choix ' + (parseInt(a) + 1) : a)).join(', ') : q.correctAnswers}</div>` : ''}
                </div>
            `;
        }).join('');

        document.getElementById('quiz-footer').style.display = 'none';

        container.innerHTML = `
            <div style="text-align:center; padding:30px; background:rgba(88, 101, 242, 0.1); border-radius:20px; border:1px solid rgba(88, 101, 242, 0.3); margin-bottom:30px;">
                <div style="font-size:48px; margin-bottom:10px;">🎉</div>
                <h2 style="font-size:24px; margin-bottom:5px;">Félicitations !</h2>
                <div style="font-size:18px; color:rgba(255,255,255,0.7);">Votre score final : <span style="font-size:32px; font-weight:800; color:#fff;">${totalScore}/${maxScore}</span></div>
            </div>
            ${resultsHtml}
        `;
    }
};
