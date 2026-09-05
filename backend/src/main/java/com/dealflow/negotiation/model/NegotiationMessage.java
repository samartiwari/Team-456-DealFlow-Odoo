package com.dealflow.negotiation.model;

import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;

import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One remark in the thread. Append-only, and both sides read the same rows. */
@Entity
@Table(name = "negotiation_msg")
@Getter
@Setter
@NoArgsConstructor
public class NegotiationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    /** Null when the message is about the order rather than one line. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "line_id")
    private QuotationLine line;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageAuthor author;

    @Column(name = "author_name", nullable = false, length = 160)
    private String authorName;

    @Column(nullable = false, length = 2000)
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public NegotiationMessage(Quotation quotation, QuotationLine line, MessageAuthor author,
                              String authorName, String body) {
        this.quotation = quotation;
        this.line = line;
        this.author = author;
        this.authorName = authorName;
        this.body = body;
    }
}
