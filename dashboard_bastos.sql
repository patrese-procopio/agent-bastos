-- ═══════════════════════════════════════════════════════════════════════
-- AGENT BASTOS — Schema SQLite para Dashboard de Produção
-- Banco: dashboard_bastos.db
-- Criado: 2026-05
-- ═══════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;   -- melhor performance em leitura simultânea
PRAGMA foreign_keys = ON;

-- ───────────────────────────────────────────────────────────────────────
-- TABELA: tipos_documento
-- Catálogo dos tipos de documento produzidos pela agência
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tipos_documento (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT NOT NULL UNIQUE,   -- ex: 'RELINT', 'RELTEC', 'REL_INTERNO'
    nome      TEXT NOT NULL,          -- ex: 'Relatório de Inteligência'
    pasta     TEXT NOT NULL           -- nome da pasta no servidor: '1. RELINTS'
);

INSERT OR IGNORE INTO tipos_documento (codigo, nome, pasta) VALUES
    ('RELINT',       'Relatório de Inteligência',           '1. RELINTS'),
    ('RELTEC',       'Relatório Técnico',                   '2. RELTECS'),
    ('REL_INTERNO',  'Relatório Interno',                   '3. RELATÓRIOS INTERNOS'),
    ('PARLATORIO',   'Parlatório Virtual',                  '5. PARLATÓRIOS VIRTUAIS'),
    ('PARECER_REM',  'Parecer Técnico de Remição',          '6. PARECERES TÉCNICOS - REMIÇÃO'),
    ('PED_BUSCA',    'Pedido de Busca',                     '7. PEDIDO DE BUSCA'),
    ('MEMORANDO',    'Memorando',                           '10. MEMORANDO'),
    ('REPEN',        'REPEN',                               '11. REPEN');

-- ───────────────────────────────────────────────────────────────────────
-- TABELA: unidades
-- Unidades prisionais e núcleos produtores
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    sigla     TEXT NOT NULL UNIQUE,
    nome      TEXT NOT NULL,
    tipo      TEXT NOT NULL CHECK(tipo IN ('nucleo', 'unidade_prisional'))
);

INSERT OR IGNORE INTO unidades (sigla, nome, tipo) VALUES
    -- Núcleos produtores (quem produziu o documento)
    ('NI',      'Núcleo de Inteligência',              'nucleo'),
    ('NCI',     'Núcleo de Contrainteligência',        'nucleo'),
    ('NBE',     'Núcleo de Busca Estratégica',         'nucleo'),
    -- Unidades prisionais (destino/referência dos relatórios internos e pareceres)
    ('UPP',     'Unidade Prisional de Puraquequara',   'unidade_prisional'),
    ('COMPAJ',  'COMPAJ',                              'unidade_prisional'),
    ('IPAT',    'IPAT',                                'unidade_prisional'),
    ('CDPM1',   'CDPM 1',                              'unidade_prisional'),
    ('CDPM2',   'CDPM 2',                              'unidade_prisional'),
    ('CDF',     'CDF',                                 'unidade_prisional');

-- ───────────────────────────────────────────────────────────────────────
-- TABELA: documentos
-- Tabela central — cada linha = 1 PDF produzido
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identificação do arquivo
    nome_arquivo        TEXT NOT NULL,          -- ex: 'RELINT_NI_001_2026.pdf'
    caminho_rede        TEXT,                   -- path completo no servidor SEAP (opcional)

    -- Classificação
    tipo_id             INTEGER NOT NULL REFERENCES tipos_documento(id),
    nucleo_produtor_id  INTEGER NOT NULL REFERENCES unidades(id),
    unidade_ref_id      INTEGER REFERENCES unidades(id), -- NULL para docs sem unidade específica

    -- Temporalidade
    ano                 INTEGER NOT NULL DEFAULT 2026,
    mes                 INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
    data_registro       TEXT NOT NULL DEFAULT (date('now')), -- data de lançamento no sistema

    -- Controle
    observacao          TEXT,
    registrado_por      TEXT,                   -- nome do agente que lançou
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────────────────────────────────────────────────────────────────
-- ÍNDICES para performance nas queries do Dashboard
-- ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doc_tipo    ON documentos(tipo_id);
CREATE INDEX IF NOT EXISTS idx_doc_mes     ON documentos(mes, ano);
CREATE INDEX IF NOT EXISTS idx_doc_nucleo  ON documentos(nucleo_produtor_id);
CREATE INDEX IF NOT EXISTS idx_doc_unidade ON documentos(unidade_ref_id);

-- ───────────────────────────────────────────────────────────────────────
-- VIEWS — queries prontas para o Dashboard
-- ───────────────────────────────────────────────────────────────────────

-- Produção total por mês e tipo
CREATE VIEW IF NOT EXISTS v_producao_mes_tipo AS
SELECT
    d.ano,
    d.mes,
    t.codigo   AS tipo,
    t.nome     AS tipo_nome,
    COUNT(*)   AS total
FROM documentos d
JOIN tipos_documento t ON t.id = d.tipo_id
GROUP BY d.ano, d.mes, t.id
ORDER BY d.ano, d.mes, t.codigo;

-- Produção por núcleo produtor e mês
CREATE VIEW IF NOT EXISTS v_producao_nucleo_mes AS
SELECT
    d.ano,
    d.mes,
    u.sigla    AS nucleo,
    t.codigo   AS tipo,
    COUNT(*)   AS total
FROM documentos d
JOIN unidades u         ON u.id = d.nucleo_produtor_id
JOIN tipos_documento t  ON t.id = d.tipo_id
GROUP BY d.ano, d.mes, u.id, t.id
ORDER BY d.ano, d.mes, u.sigla;

-- Produção por unidade prisional (relatórios internos e pareceres)
CREATE VIEW IF NOT EXISTS v_producao_unidade_mes AS
SELECT
    d.ano,
    d.mes,
    u.sigla    AS unidade,
    t.codigo   AS tipo,
    COUNT(*)   AS total
FROM documentos d
JOIN unidades u         ON u.id = d.unidade_ref_id
JOIN tipos_documento t  ON t.id = d.tipo_id
WHERE d.unidade_ref_id IS NOT NULL
GROUP BY d.ano, d.mes, u.id, t.id
ORDER BY d.ano, d.mes, u.sigla;

-- Resumo geral do ano (KPIs do topo do Dashboard)
CREATE VIEW IF NOT EXISTS v_kpi_ano AS
SELECT
    d.ano,
    COUNT(*)                                        AS total_documentos,
    COUNT(DISTINCT d.mes)                           AS meses_com_producao,
    COUNT(DISTINCT d.nucleo_produtor_id)            AS nucleos_ativos,
    ROUND(CAST(COUNT(*) AS REAL) / COUNT(DISTINCT d.mes), 1) AS media_docs_mes
FROM documentos d
GROUP BY d.ano;

-- ───────────────────────────────────────────────────────────────────────
-- EXEMPLOS DE INSERT (como lançar documentos)
-- ───────────────────────────────────────────────────────────────────────

-- Exemplo: RELINT produzido pelo NI em Janeiro/2026
-- INSERT INTO documentos (nome_arquivo, tipo_id, nucleo_produtor_id, ano, mes, registrado_por)
-- VALUES ('RELINT_NI_001_JAN2026.pdf',
--         (SELECT id FROM tipos_documento WHERE codigo = 'RELINT'),
--         (SELECT id FROM unidades WHERE sigla = 'NI'),
--         2026, 1, 'Agente Patrese');

-- Exemplo: Relatório Interno do COMPAJ em Abril/2026
-- INSERT INTO documentos (nome_arquivo, tipo_id, nucleo_produtor_id, unidade_ref_id, ano, mes)
-- VALUES ('REL_INT_COMPAJ_ABR2026.pdf',
--         (SELECT id FROM tipos_documento WHERE codigo = 'REL_INTERNO'),
--         (SELECT id FROM unidades WHERE sigla = 'NI'),
--         (SELECT id FROM unidades WHERE sigla = 'COMPAJ'),
--         2026, 4);

-- Exemplo: Parecer Técnico do CDF em Março/2026
-- INSERT INTO documentos (nome_arquivo, tipo_id, nucleo_produtor_id, unidade_ref_id, ano, mes)
-- VALUES ('PARECER_CDF_MAR2026.pdf',
--         (SELECT id FROM tipos_documento WHERE codigo = 'PARECER_REM'),
--         (SELECT id FROM unidades WHERE sigla = 'NCI'),
--         (SELECT id FROM unidades WHERE sigla = 'CDF'),
--         2026, 3);
