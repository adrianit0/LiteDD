package dev.litedd.notes;

import java.util.List;

/** Nodo del árbol: sin contenido (N-01). */
public record TreeNode(String id, String parentId, int position, String type, String title, boolean favorite,
                       List<String> tags) {
}
