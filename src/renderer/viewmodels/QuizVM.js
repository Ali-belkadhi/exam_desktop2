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
            container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-secondary);">
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
                    <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer; color:var(--text-primary); transition: opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <input type="checkbox" onchange="QuizVM.setAnswer('${q.id}', '${oIdx}', this.checked)" style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer;">
                        <span style="font-size:15px;">${opt}</span>
                    </label>
                `).join('');
            } else if (q.type === 'QCMImage') {
                optionsHtml = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px; margin-top: 10px;">` + 
                (q.options || []).map((opt, oIdx) => `
                    <label style="display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; background: var(--window-bg); padding: 12px; border-radius: 12px; border: 1px solid var(--border); transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'" onmouseout="this.style.borderColor='var(--border)'; this.style.transform='none'; this.style.boxShadow='none'">
                        ${opt ? `<img src="${opt}" style="max-height: 100px; width: 100%; object-fit: contain; border-radius: 6px;"/>` : `<div style="height:100px; width:100%; background:var(--surface-color); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--text-secondary); border-radius: 6px;">Aucune image</div>`}
                        <div style="display:flex; align-items:center; gap:8px; margin-top:5px; color:var(--text-primary);">
                            <input type="checkbox" onchange="QuizVM.setAnswer('${q.id}', '${oIdx}', this.checked)" style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer;">
                            <span style="font-size:13px; font-weight:600;">Choix ${oIdx + 1}</span>
                        </div>
                    </label>
                `).join('') + `</div>`;
            } else if (q.type === 'VraiFaux') {
                optionsHtml = `
                    <div style="display:flex; gap:24px; color:var(--text-primary);">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:15px;">
                            <input type="radio" name="q_${q.id}" onchange="QuizVM.setAnswer('${q.id}', 'Vrai')" style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer;"> Vrai
                        </label>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:15px;">
                            <input type="radio" name="q_${q.id}" onchange="QuizVM.setAnswer('${q.id}', 'Faux')" style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer;"> Faux
                        </label>
                    </div>
                `;
            } else if (q.type === 'Libre') {
                optionsHtml = `<textarea style="width:100%; height:100px; padding:12px; border-radius:8px; background:var(--window-bg); color:var(--text-primary); border:1px solid var(--border); font-size:14px; transition: border-color 0.2s, box-shadow 0.2s; outline:none;" placeholder="Saisissez votre réponse ici..." onfocus="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 0 0 3px rgba(37, 99, 235, 0.1)'" onblur="this.style.borderColor='var(--border)'; this.style.boxShadow='none'" oninput="QuizVM.setAnswer('${q.id}', this.value)"></textarea>`;
            } else if (q.type === 'Classement') {
                optionsHtml = `
                    <div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px; background:var(--window-bg); padding:10px; border-radius:8px; border:1px solid var(--border);">💡 Indiquez l'ordre correct en séparant par des virgules (ex: 1,3,2,4) pour les éléments suivants:</div>
                    <div style="margin-bottom:15px; color:var(--text-primary); padding-left:10px; border-left:3px solid var(--primary);">
                        ${(q.options || []).map((opt, oIdx) => `<div style="padding:6px 0; font-size:15px; font-weight:500;">${oIdx + 1}. ${opt}</div>`).join('')}
                    </div>
                    <input type="text" placeholder="Ordre (ex: 2,1,3)" style="width:100%; height:42px; padding:0 12px; border-radius:8px; background:var(--window-bg); border:1px solid var(--border); color:var(--text-primary); font-size:15px; transition: border-color 0.2s, box-shadow 0.2s; outline:none;" onfocus="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 0 0 3px rgba(37, 99, 235, 0.1)'" onblur="this.style.borderColor='var(--border)'; this.style.boxShadow='none'" oninput="QuizVM.setAnswer('${q.id}', this.value)">
                `;
            }

            return `
                <div style="background:var(--window-header); border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:24px; box-shadow: var(--shadow-inactive); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-size:15px; font-weight:700; color:var(--primary); background:rgba(37, 99, 235, 0.1); padding:4px 10px; border-radius:20px;">Question ${idx + 1}</span>
                        <span style="font-weight:600; color:var(--text-secondary); font-size:13px;">${q.points || 1} points</span>
                    </div>
                    <div style="font-size:17px; font-weight:600; margin-bottom:20px; line-height:1.5; color:var(--text-primary);">${q.text || 'Question sans texte'}</div>
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
        const API_BASE = 'https://safe-exam-db-ll3f.onrender.com';
        localStorage.setItem('apiBase', API_BASE);

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
                <div style="background:var(--window-header); border:1px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'}; border-radius:15px; padding:24px; margin-bottom:20px; box-shadow: var(--shadow-inactive);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-size:15px; font-weight:700; color:var(--primary); background:rgba(37, 99, 235, 0.1); padding:4px 10px; border-radius:20px;">Question ${idx + 1}</span>
                        <span style="font-weight:700; color:${isCorrect ? 'var(--success)' : 'var(--danger)'}; font-size:14px; background:${isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; padding:4px 10px; border-radius:20px;">${score}/${q.points} pt(s)</span>
                    </div>
                    <div style="font-size:16px; margin-bottom:15px; color:var(--text-primary); font-weight:500;">${q.text}</div>
                    <div style="background:var(--window-bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
                        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:4px;">Votre réponse :</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:14px;">${Array.isArray(userAnswer) ? userAnswer.map(a => (q.type === 'QCMImage' ? 'Choix ' + (parseInt(a) + 1) : a)).join(', ') : (userAnswer || '—')}</div>
                        ${!isCorrect ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
                            <div style="font-size:13px; color:var(--text-secondary); margin-bottom:4px;">Réponse attendue :</div>
                            <div style="color:var(--success); font-weight:600; font-size:14px;">${Array.isArray(q.correctAnswers) ? q.correctAnswers.map(a => (q.type === 'QCMImage' ? 'Choix ' + (parseInt(a) + 1) : a)).join(', ') : q.correctAnswers}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('quiz-footer').style.display = 'none';

        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:rgba(37, 99, 235, 0.05); border-radius:24px; border:2px solid var(--primary); margin-bottom:30px; box-shadow: 0 10px 25px rgba(37, 99, 235, 0.1);">
                <div style="font-size:56px; margin-bottom:15px; text-shadow: 0 4px 10px rgba(0,0,0,0.1);">🎉</div>
                <h2 style="font-size:28px; margin-bottom:10px; color:var(--text-primary); font-weight:800;">Félicitations !</h2>
                <div style="font-size:16px; color:var(--text-secondary); margin-bottom: 10px;">Le quiz a été soumis avec succès.</div>
                <div style="display:inline-block; margin-top:10px; padding: 15px 30px; background:var(--window-bg); border-radius:16px; border:1px solid var(--border); box-shadow: var(--shadow-inactive);">
                    <div style="font-size:14px; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); font-weight:600; margin-bottom:5px;">Score Final</div>
                    <div style="font-size:42px; font-weight:800; color:var(--primary); line-height:1;"><span style="color:var(--text-primary);">${totalScore}</span><span style="font-size:24px; color:var(--text-secondary);">/${maxScore}</span></div>
                </div>
            </div>
            <h3 style="font-size:20px; font-weight:700; color:var(--text-primary); margin-bottom:20px; padding-bottom:10px; border-bottom:2px solid var(--border);">Correction détaillée</h3>
            ${resultsHtml}
        `;
    }
};
