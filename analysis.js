// =================================================================
//  Analysis — 统计分析工具层（纯函数，无 UI 依赖）
//  所有页面可通过 Analysis.* 调用这些方法
//  加载顺序：shared.js → analysis.js → 页面脚本
// =================================================================
const Analysis = {

    // ============ Ranking Calculation ============
    // 规则：每条记录中，每个任务取最佳成绩（得分最高，得分相同时用时最短）
    //       所有任务最佳成绩之和为最终成绩
    //       按最终得分降序、最终用时升序排名
    //       弃权（withdrawn）的单元格：得分=0，用时=150，排在最后
    //
    //   scores  — { studentId: { taskId: { round1: {...}, round2: {...} } } }
    //   taskItems — [{ taskId, rounds }]
    //   students — [{ id, name }]
    //   getRounds — (entry) => rounds[]  提取轮次数组的函数
    //   返回 — { [studentId]: rankNumber }
    calcRankings(scores, taskItems, students, getRounds) {
        const results = students.map(student => {
            let totalScore = 0;
            let totalTime = 0;
            let hasAnyScore = false;
            let allWithdrawn = true;

            taskItems.forEach(ti => {
                const tid = ti.taskId || '__default__';
                const entry = scores[student.id] && scores[student.id][tid]
                    ? scores[student.id][tid]
                    : null;
                if (!entry) return;

                const rounds = getRounds(entry);
                let bestScore = null;
                let bestTime = null;

                rounds.forEach(r => {
                    if (r.withdrawn) {
                        if (bestScore === null || 0 > bestScore) {
                            bestScore = 0;
                            bestTime = 150;
                        }
                        return;
                    }
                    if (r.score === undefined || r.score === null) return;
                    if (bestScore === null || r.score > bestScore ||
                        (r.score === bestScore && (r.time !== null && r.time !== undefined) &&
                         (bestTime === null || r.time < bestTime))) {
                        bestScore = r.score;
                        bestTime = r.time ?? null;
                    }
                });

                if (bestScore !== null) {
                    totalScore += bestScore;
                    if (bestTime !== null) totalTime += bestTime;
                    hasAnyScore = true;
                    if (bestScore > 0 || bestTime < 150) allWithdrawn = false;
                }
            });

            return {
                studentId: student.id,
                totalScore, totalTime, hasAnyScore,
                isWithdrawn: allWithdrawn && hasAnyScore
            };
        });

        // Sort: non-withdrawn first (by totalScore desc, totalTime asc), then withdrawn at the end
        const ranked = results
            .filter(r => r.hasAnyScore)
            .sort((a, b) => {
                if (a.isWithdrawn !== b.isWithdrawn) return a.isWithdrawn ? 1 : -1;
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                return a.totalTime - b.totalTime;
            });

        const rankings = {};
        ranked.forEach((r, idx) => {
            rankings[r.studentId] = idx + 1;
        });
        return rankings;
    },

    // ============ Practice Stats ============
    // 计算练习记录统计数据
    //   records — [{ score, time, date, round, taskId }]
    //   allTasks — [{ id, name, maxScore }]  查找满分率用
    //   返回 — 包含 avgScore、stage、outliers、expectedRange 等统计值
    calcPracticeStats(records, allTasks) {
        if (records.length === 0) return null;

        // Chronological order
        const chrono = [...records].sort((a, b) => a.date.localeCompare(b.date) || (a.round || 1) - (b.round || 1));
        const allScores = chrono.map(r => r.score);
        const allTimes = chrono.map(r => r.time).filter(t => t !== null);

        // Latest 10
        const byDate = [...records].sort((a, b) => b.date.localeCompare(b.date) || (b.round || 1) - (a.round || 1));
        const latest10 = byDate.slice(0, 10);
        const scores10 = latest10.map(r => r.score);
        const times10 = latest10.map(r => r.time).filter(t => t !== null);

        const avgScore = scores10.reduce((a, b) => a + b, 0) / scores10.length;
        const avgTime = times10.length > 0 ? times10.reduce((a, b) => a + b, 0) / times10.length : null;

        // Time-based stability: residuals from moving average (window=3)
        let timeBasedVar = 0;
        if (allScores.length >= 4) {
            const residuals = [];
            for (let i = 1; i < allScores.length - 1; i++) {
                const ma = (allScores[i - 1] + allScores[i] + allScores[i + 1]) / 3;
                residuals.push(allScores[i] - ma);
            }
            const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
            timeBasedVar = residuals.reduce((a, b) => a + (b - meanRes) ** 2, 0) / residuals.length;
        }

        // Full score rate: exact match / total with maxScore set
        let fullCnt = 0, totalWithMax = 0;
        records.forEach(r => {
            const task = allTasks.find(t => t.id === r.taskId);
            if (task && task.maxScore != null && task.maxScore > 0) {
                totalWithMax++;
                if (r.score === task.maxScore) fullCnt++;
            }
        });
        const fullRate = totalWithMax > 0 ? (fullCnt / totalWithMax * 100) : null;

        // Outlier detection
        const outliers = Analysis.detectOutliers(allScores);
        const outlierCount = outliers.filter(o => o.isOutlier).length;
        const outlierRate = records.length > 0 ? (outlierCount / records.length * 100) : 0;

        // S-curve stage
        const stage = Analysis.sCurveStage(allScores);

        // Expected score range (mean ± 1.5σ)
        const overallMean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        const overallStd = Math.sqrt(allScores.reduce((a, b) => a + (b - overallMean) ** 2, 0) / allScores.length);
        const expectedLow = overallMean - 1.5 * overallStd;
        const expectedHigh = overallMean + 1.5 * overallStd;

        // Stability (time-based)
        const stabilityLabel = timeBasedVar < 5 ? 'A 稳定' : timeBasedVar < 15 ? 'B 较稳定' : timeBasedVar < 30 ? 'C 波动' : 'D 波动大';
        const stabilityColor = timeBasedVar < 5 ? '#10b981' : timeBasedVar < 15 ? '#22c55e' : timeBasedVar < 30 ? '#f59e0b' : '#ef4444';

        // Max / min
        const maxScore = Math.max(...allScores);
        const minScore = Math.min(...allScores);
        const threshold = 0.8 * maxScore;
        let bestStreak = 0, curStreak = 0;
        allScores.forEach(s => {
            if (s >= threshold) { curStreak++; if (curStreak > bestStreak) bestStreak = curStreak; }
            else curStreak = 0;
        });

        return {
            avgScore, avgTime, fullRate,
            stage, stabilityLabel, stabilityColor, timeBasedVar,
            maxScore, minScore, bestStreak,
            expectedLow, expectedHigh,
            overallMean, overallStd,
            total: records.length,
            outlierCount, outlierRate,
        };
    },

    // ============ Mathematical Tools ============

    // Linear Regression — 返回斜率
    linearRegression(data) {
        const n = data.length;
        if (n < 2) return null;
        const sumX = data.reduce((a, b) => a + b.x, 0);
        const sumY = data.reduce((a, b) => a + b.y, 0);
        const sumXY = data.reduce((a, b) => a + b.x * b.y, 0);
        const sumXX = data.reduce((a, b) => a + b.x * b.x, 0);
        const denom = n * sumXX - sumX * sumX;
        if (denom === 0) return null;
        return (n * sumXY - sumX * sumY) / denom;
    },

    // IQR-based Outlier Detection — 返回每个分数是否异常
    detectOutliers(scores) {
        if (scores.length < 4) return [];
        const sorted = [...scores].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        if (iqr === 0) return [];
        const lower = q1 - 1.5 * iqr;
        return scores.map((s, i) => ({ idx: i, score: s, isOutlier: s < lower }));
    },

    // Stability Rating — 根据变异系数评估稳定性 (A~D)
    stabilityRating(variance, avg) {
        if (avg === 0) return { label: '—', color: 'var(--gray-300)' };
        const cv = Math.sqrt(variance) / avg;
        if (cv < 0.05) return { label: 'A 非常稳定', color: '#10b981' };
        if (cv < 0.1) return { label: 'B 稳定', color: '#22c55e' };
        if (cv < 0.18) return { label: 'C 一般', color: '#f59e0b' };
        return { label: 'D 波动大', color: '#ef4444' };
    },

    // ============ Trend / S-Curve Analysis ============

    // S曲线阶段判定 — 根据分数数组分析学习者所处的学习阶段
    sCurveStage(scores) {
        const n = scores.length;
        if (n < 6) return { stage: '📊 数据不足', desc: `仅 ${n} 条，至少需 6 条` };
        const third = Math.floor(n / 3);
        const early = scores.slice(0, third);
        const middle = scores.slice(third, 2 * third);
        const late = scores.slice(2 * third);
        const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const eAvg = avg(early), mAvg = avg(middle), lAvg = avg(late);
        const eSlope = (mAvg - eAvg) / third;
        const lSlope = (lAvg - mAvg) / third;

        if (eSlope < 0.5 && lSlope < 0.5) {
            if (eAvg >= 85) return { stage: '🔵 高分段平台期', desc: `稳定在 ${eAvg.toFixed(0)} 分，已接近上限` };
            return { stage: '🔵 平台期', desc: `进步停滞在 ${eAvg.toFixed(0)} 分，需调整方法` };
        }
        if (eSlope < 0.8 && lSlope >= 0.8) {
            return { stage: '🟢 快速提升期', desc: `每次练习提升 ${lSlope.toFixed(1)} 分，势头强劲` };
        }
        if (eSlope < 0.8 && lSlope < 0.8 && eAvg < 70) {
            return { stage: '🟡 起步期', desc: `刚开始练习，缓慢进步中 (${eSlope.toFixed(1)})` };
        }
        if (eSlope >= 1 && lSlope < eSlope * 0.5) {
            return { stage: '🟠 减速期', desc: '进步放缓，可能接近平台期' };
        }
        return { stage: '🟢 稳步上升', desc: `每次练习提升 ${((eSlope + lSlope) / 2).toFixed(1)} 分` };
    },

    // ============ Chart Data Builders ============

    // 从模拟赛成绩构建图表数据点
    //   mockScores  — mockCompetitions 数组（每项含 .name, .scores[studentId][taskId]）
    //   taskIds     — 任务 ID 列表
    //   studentId   — 当前学生 ID
    //   getRounds   — (entry) => rounds[]
    //   返回 — { [taskId]: [{ label, score, time }, ...] }
    buildMockChartSeries(mockScores, taskIds, studentId, getRounds) {
        const chartData = {};
        taskIds.forEach(tid => { chartData[tid] = []; });

        // Sort mocks by date chronologically
        const sortedMocks = [...mockScores].sort((a, b) =>
            (a.date || '').localeCompare(b.date || '')
        );

        let globalPos = 0; // global x-axis position counter
        const taskAttemptCount = {};
        taskIds.forEach(tid => { taskAttemptCount[tid] = 0; });

        sortedMocks.forEach((mock) => {
            // Determine max rounds across all tasks for this mock
            let maxRounds = 0;
            taskIds.forEach((tid) => {
                const entry = mock.scores[studentId] && mock.scores[studentId][tid]
                    ? mock.scores[studentId][tid] : null;
                const rounds = getRounds(entry);
                if (rounds.length > maxRounds) maxRounds = rounds.length;
            });
            if (maxRounds === 0) return; // no data for this student in this mock

            for (let ri = 0; ri < maxRounds; ri++) {
                const globalLabel = String(globalPos);
                const posLabel = maxRounds > 1 ? `${mock.name}(第${ri+1}轮)` : mock.name;

                taskIds.forEach((tid) => {
                    const entry = mock.scores[studentId] && mock.scores[studentId][tid]
                        ? mock.scores[studentId][tid] : null;
                    const rounds = getRounds(entry);
                    const roundEntry = rounds[ri];
                    if (roundEntry && !roundEntry.withdrawn) {
                        const sc = roundEntry.score, tm = roundEntry.time;
                        if (sc !== undefined && sc !== null) {
                            taskAttemptCount[tid]++;
                            chartData[tid].push({
                                recordIdx: 0, round: ri,
                                label: globalLabel,
                                fullLabel: posLabel,
                                attempt: taskAttemptCount[tid],
                                score: sc, time: tm
                            });
                        }
                    }
                });
                globalPos++;
            }
        });
        return chartData;
    },

    // 从自主练习记录构建图表数据点
    //   records — 已按 studentId（和 taskId）过滤后的练习记录数组
    //   返回 — { labels[], data: { [taskId]: [{ label, score, time }] }, taskIds[], maxScore, maxTime }
    buildPracticeChartSeries(records) {
        const chrono = [...records].sort((a, b) =>
            a.date.localeCompare(b.date) || (a.round || 1) - (b.round || 1)
        );
        const taskIds = [...new Set(chrono.map(r => r.taskId))];
        const data = {};
        taskIds.forEach(tid => { data[tid] = []; });
        chrono.forEach(r => {
            if (!data[r.taskId]) data[r.taskId] = [];
            data[r.taskId].push({
                label: `${r.date} #${r.round || 1}`,
                score: r.score, time: r.time
            });
        });
        return {
            labels: chrono.map(r => `${r.date} #${r.round || 1}`),
            data, taskIds,
            maxScore: Math.max(1, ...chrono.map(r => r.score)),
            maxTime: Math.max(1, ...chrono.map(r => r.time || 0))
        };
    },

    // 计算双轴图表的共同数据范围
    //   chartData — { [taskId]: [{ label, score, time }] }
    //   返回 — { allLabels[], maxScore, maxTime, totalPoints }
    computeChartBounds(chartData) {
        const allLabels = [];
        let maxScore = 0, maxTime = 0;
        Object.values(chartData).forEach(points => {
            points.forEach(d => {
                if (!allLabels.includes(d.label)) allLabels.push(d.label);
                if (d.score > maxScore) maxScore = d.score;
                if (d.time > maxTime) maxTime = d.time;
            });
        });
        // Sort labels numerically to ensure correct x-axis order
        allLabels.sort((a, b) => parseInt(a) - parseInt(b));
        return {
            allLabels,
            maxScore: Math.max(maxScore, 1),
            maxTime: Math.max(maxTime, 1),
            totalPoints: allLabels.length
        };
    },
};

window.Analysis = Analysis;
