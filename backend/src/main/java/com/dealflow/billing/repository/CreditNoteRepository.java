package com.dealflow.billing.repository;

import com.dealflow.billing.model.CreditNote;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditNoteRepository extends JpaRepository<CreditNote, Long> {}
