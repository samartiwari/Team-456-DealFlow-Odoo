package com.dealflow.common.pdf;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * A PDF, assembled by hand from pages of monospaced text.
 *
 * <p>Extracted from the report writer when the invoice needed the same thing.
 * The structure is the part worth sharing and the part easy to get subtly
 * wrong: the object numbering, and an xref table whose offsets are the real
 * byte positions in the stream rather than a guess. What each document says is
 * its own business; how the bytes are laid out is not.
 *
 * <p>Courier, because a monospaced font is what lets a column of figures line
 * up without a text-measurement pass.
 */
public final class PdfDocument {

    public static final int PAGE_WIDTH = 842;
    public static final int PAGE_HEIGHT = 595;
    public static final int MARGIN = 36;
    public static final int LINE_HEIGHT = 13;

    /** How many text lines fit on a page at this size. */
    public static final int ROWS_PER_PAGE = 32;

    private PdfDocument() {
    }

    /** @param pages one list of text lines per page; never empty */
    public static byte[] render(List<List<String>> pages) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<Integer> offsets = new ArrayList<>();

        // 1 catalog, 2 page tree, 3 font, then a content stream and a page per chunk.
        int firstPageObject = 4;
        int objectCount = 3 + pages.size() * 2;

        append(out, "%PDF-1.4\n");

        offsets.add(out.size());
        append(out, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < pages.size(); i++) {
            kids.append(firstPageObject + i * 2 + 1).append(" 0 R ");
        }
        offsets.add(out.size());
        append(out, "2 0 obj\n<< /Type /Pages /Kids [" + kids.toString().trim()
                + "] /Count " + pages.size() + " >>\nendobj\n");

        offsets.add(out.size());
        append(out, "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

        for (int i = 0; i < pages.size(); i++) {
            int contentObj = firstPageObject + i * 2;
            int pageObj = contentObj + 1;

            byte[] stream = contentStream(pages.get(i)).getBytes(StandardCharsets.ISO_8859_1);
            offsets.add(out.size());
            append(out, contentObj + " 0 obj\n<< /Length " + stream.length + " >>\nstream\n");
            out.writeBytes(stream);
            append(out, "endstream\nendobj\n");

            offsets.add(out.size());
            append(out, pageObj + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
                    + PAGE_WIDTH + " " + PAGE_HEIGHT + "]"
                    + " /Resources << /Font << /F1 3 0 R >> >>"
                    + " /Contents " + contentObj + " 0 R >>\nendobj\n");
        }

        int xrefAt = out.size();
        StringBuilder xref = new StringBuilder("xref\n0 " + (objectCount + 1) + "\n");
        xref.append("0000000000 65535 f \n");
        for (int offset : offsets) {
            xref.append(String.format("%010d 00000 n %n", offset)
                    .replace(System.lineSeparator(), "\n"));
        }
        append(out, xref.toString());
        append(out, "trailer\n<< /Size " + (objectCount + 1) + " /Root 1 0 R >>\nstartxref\n"
                + xrefAt + "\n%%EOF\n");

        return out.toByteArray();
    }

    private static String contentStream(List<String> lines) {
        StringBuilder sb = new StringBuilder("BT\n/F1 8 Tf\n");
        sb.append(LINE_HEIGHT).append(" TL\n");
        sb.append("1 0 0 1 ").append(MARGIN).append(' ').append(PAGE_HEIGHT - MARGIN).append(" Tm\n");
        for (String line : lines) {
            sb.append('(').append(escape(line)).append(") Tj T*\n");
        }
        sb.append("ET\n");
        return sb.toString();
    }

    /** Parentheses and backslashes end a PDF string early if they are not escaped. */
    public static String escape(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            if (c == '(' || c == ')' || c == '\\') {
                sb.append('\\');
            }
            sb.append(c < 128 ? c : '?');
        }
        return sb.toString();
    }

    public static String clip(String value, int width) {
        if (value == null) {
            return "";
        }
        return value.length() <= width ? value : value.substring(0, width - 1) + "…";
    }

    private static void append(ByteArrayOutputStream out, String text) {
        out.writeBytes(text.getBytes(StandardCharsets.ISO_8859_1));
    }
}
