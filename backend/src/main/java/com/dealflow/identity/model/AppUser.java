package com.dealflow.identity.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    @Id
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Column(nullable = false, length = 160)
    private String email;

    /** Bcrypt. Never leaves the server, and never appears in a response DTO. */
    @Column(name = "password_hash", nullable = false, length = 72)
    private String passwordHash;
}
