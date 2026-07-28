import type { Database } from '../infrastructure/db.js';

export type GraphNode = {
  id: string;
  object_type: string;
  title: string;
  status: string;
};

export type GraphEdge = {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  strength: number | null;
};

export async function loadKnowledgeGraph(database: Database): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [nodes, edges] = await Promise.all([
    database.query<GraphNode>(
      `SELECT id, object_type, title, status
       FROM core.knowledge_objects
       ORDER BY object_type, created_at
       LIMIT 250`,
    ),
    database.query<GraphEdge>(
      `SELECT id, source_id, target_id, relation_type, strength
       FROM core.relations
       ORDER BY created_at
       LIMIT 500`,
    ),
  ]);
  return { nodes: nodes.rows, edges: edges.rows };
}
