package com.dealflow.common;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Every tunable constant in the system. Change a row, restart, routing changes. */
@Entity
@Table(name = "system_config")
@Getter
@Setter
@NoArgsConstructor
public class SystemConfig {

    @Id
    @Column(name = "key", length = 80)
    private String key;

    @Column(name = "value", nullable = false, length = 120)
    private String value;
}
