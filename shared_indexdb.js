// =================================================================
//  Shared — IndexedDB 存储层（STS_DB）
//  所有 IDB 操作独立于此文件，不污染核心 shared.js
//  加载顺序：shared.js → shared_indexdb.js → header.js
// =================================================================
(function () {
    const S = window.Shared;
    if (!S) { console.warn('shared_indexdb.js: Shared not loaded'); return; }

    // ============ 配置 ============
    S._DB_NAME = 'STS_DB';
    S._DB_VERSION = undefined;
    S._STORAGE_MODE_KEY = 'sts_storage_mode';
    S._idb = null;

    // ============ 数据库初始化 ============
    S._initIDB = async function () {
        if (this._idb) return this._idb;
        return new Promise((resolve) => {
            const req = indexedDB.open(this._DB_NAME, this._DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('students')) {
                    db.createObjectStore('students', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('classes')) {
                    db.createObjectStore('classes', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('enrollments')) {
                    const store = db.createObjectStore('enrollments', { keyPath: 'id' });
                    store.createIndex('by_student', 'studentId', { unique: false });
                    store.createIndex('by_class', 'classId', { unique: false });
                    store.createIndex('by_status', 'status', { unique: false });
                }
            };
            req.onsuccess = (e) => { this._idb = e.target.result; resolve(this._idb); };
            req.onerror = () => { console.warn('STS_DB 不可用', req.error); resolve(null); };
        });
    };

    // ============ 引擎切换 ============
    S._getEngine = function () {
        return localStorage.getItem(this._STORAGE_MODE_KEY) || 'ls';
    };

    S._setEngine = function (mode) {
        localStorage.setItem(this._STORAGE_MODE_KEY, mode);
    };

    // ============ 读取 ============
    S._readStudentsFromIDB = async function () {
        const db = await this._initIDB();
        if (!db || !db.objectStoreNames.contains('students')) return null;
        try {
            return await new Promise(r => {
                const q = db.transaction('students').objectStore('students').getAll();
                q.onsuccess = () => r(q.result);
            });
        } catch (e) { return null; }
    };

    S._readClassesFromIDB = async function () {
        const db = await this._initIDB();
        if (!db || !db.objectStoreNames.contains('classes')) return null;
        try {
            return await new Promise(r => {
                const q = db.transaction('classes').objectStore('classes').getAll();
                q.onsuccess = () => r(q.result);
            });
        } catch (e) { return null; }
    };

    S._readEnrollmentsFromIDB = async function () {
        const db = await this._initIDB();
        if (!db || !db.objectStoreNames.contains('enrollments')) return null;
        try {
            return await new Promise(r => {
                const q = db.transaction('enrollments').objectStore('enrollments').getAll();
                q.onsuccess = () => r(q.result);
            });
        } catch (e) { return null; }
    };

    // ============ 写入 ============
    S._writeStudentsToIDB = async function (students) {
        const db = await this._initIDB();
        if (!db || !db.objectStoreNames.contains('students')) return false;
        try {
            const tx = db.transaction('students', 'readwrite');
            for (const s of students) tx.objectStore('students').put(s);
            await new Promise(r => tx.oncomplete = r);
            return true;
        } catch (e) { return false; }
    };

    S._writeEnrollmentsToIDB = async function (enrollments) {
        const db = await this._initIDB();
        if (!db || !db.objectStoreNames.contains('enrollments')) return false;
        try {
            const tx = db.transaction('enrollments', 'readwrite');
            for (const e of enrollments) tx.objectStore('enrollments').put(e);
            await new Promise(r => tx.oncomplete = r);
            return true;
        } catch (e) { return false; }
    };

    // ============ 引擎覆盖（admin 页切换时调用）============
    S._overrideFromIDB = async function () {
        if (this._getEngine() !== 'idb') return;
        const classes = await this._readClassesFromIDB();
        const students = await this._readStudentsFromIDB();
        if (classes) this.data.classes = classes;
        if (students) this.data.students = students;
    };

    // ============ 验证流程 ============
    S._verifyIDB = async function () {
        const steps = [];
        const deepClone = (arr) => arr.map(x => ({ ...x }));

        const lsStudents = deepClone(this.data.students);
        const lsClasses = deepClone(this.data.classes);
        const lsEnrollments = deepClone(this.data.enrollments);
        steps.push(`📦 localStorage: classes ${lsClasses.length}条, students ${lsStudents.length}条, enrollments ${lsEnrollments.length}条`);

        const db = this._idb;
        if (!db) { steps.push('❌ IDB 未连接'); return { pass: false, steps }; }

        const requiredTables = ['students', 'classes', 'enrollments'];
        const missing = requiredTables.filter(t => !db.objectStoreNames.contains(t));
        if (missing.length > 0) {
            steps.push(`❌ 缺失表: ${missing.join(', ')}`);
            steps.push('💡 请到「数据迁移」页面重建（migration.html）');
            return { pass: false, steps };
        }

        const sOk = await this._writeStudentsToIDB(lsStudents);
        if (!sOk) { steps.push('❌ students 写入失败'); return { pass: false, steps }; }

        if (lsClasses.length > 0 || lsEnrollments.length > 0) {
            try {
                const tx = db.transaction('classes', 'readwrite');
                for (const c of lsClasses) tx.objectStore('classes').put(c);
                await new Promise(r => tx.oncomplete = r);
                const tx2 = db.transaction('enrollments', 'readwrite');
                for (const e of lsEnrollments) tx2.objectStore('enrollments').put(e);
                await new Promise(r => tx2.oncomplete = r);
                steps.push('✅ classes + enrollments 写入成功');
            } catch (e) {
                steps.push(`❌ classes/enrollments 写入失败: ${e.message}`);
                return { pass: false, steps };
            }
        }

        steps.push('✅ IDB 写入成功');

        const idbStudents = await this._readStudentsFromIDB();
        if (!idbStudents) { steps.push('❌ IDB 读取失败'); return { pass: false, steps }; }
        steps.push(`✅ IDB 读取: students ${idbStudents.length}条`);

        let pass = true;
        const diff = [];
        if (lsStudents.length !== idbStudents.length) {
            pass = false;
            diff.push(`students 条数: LS=${lsStudents.length} ≠ IDB=${idbStudents.length}`);
        }
        for (const s of lsStudents) {
            const found = idbStudents.find(x => x.id === s.id);
            if (!found) { pass = false; diff.push(`缺失: ${s.id} ${s.name}`); continue; }
            if (found.name !== s.name) { pass = false; diff.push(`${s.id} name: "${s.name}" ≠ "${found.name}"`); }
        }
        for (const s of idbStudents) {
            if (!lsStudents.find(x => x.id === s.id)) { pass = false; diff.push(`IDB 多出: ${s.id} ${s.name}`); }
        }

        if (pass) steps.push('✅ 逐字段对比: 全部一致');
        else { steps.push('❌ 发现差异:'); diff.forEach(d => steps.push(`  ${d}`)); }

        return { pass, steps };
    };
})();
