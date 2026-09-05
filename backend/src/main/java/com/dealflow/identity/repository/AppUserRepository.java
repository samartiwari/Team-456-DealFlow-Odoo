package com.dealflow.identity.repository;

import com.dealflow.identity.model.AppUser;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {}
