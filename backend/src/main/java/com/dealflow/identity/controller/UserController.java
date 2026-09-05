package com.dealflow.identity.controller;

import com.dealflow.common.error.ApiException;
import com.dealflow.identity.dto.AuthUserResponse;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.identity.security.CurrentUser;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The staff directory, for the screens that filter by person.
 *
 * <p>The reporting screen offers a rep filter, and its {@code repId} has to come from
 * somewhere: a hard-coded list would go stale the first time somebody signed up, and
 * inferring the reps from whoever happens to appear in the current report would hide
 * exactly the rep whose quiet quarter is worth asking about.
 *
 * <p>Closed to reps. Not because a colleague's name is a secret, but because the only
 * screens that need this are the manager-facing ones, and a directory endpoint open to
 * everyone is a thing that gets used for something else later.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AppUserRepository users;
    private final CurrentUser currentUser;

    public UserController(AppUserRepository users, CurrentUser currentUser) {
        this.users = users;
        this.currentUser = currentUser;
    }

    /**
     * @param role optional filter; absent lists everybody
     */
    @GetMapping
    public List<AuthUserResponse> list(@RequestParam(required = false) String role) {
        if (UserRole.REP.name().equals(currentUser.role())) {
            throw ApiException.forbidden("Only a manager can list users.");
        }

        UserRole filter = parse(role);
        return users.findAll().stream()
                .filter(u -> filter == null || u.getRole() == filter)
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .map(UserController::toResponse)
                .toList();
    }

    private static UserRole parse(String role) {
        if (role == null || role.isBlank()) {
            return null;
        }
        try {
            return UserRole.valueOf(role.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.invalid(role + " is not a role.", "role");
        }
    }

    private static AuthUserResponse toResponse(AppUser user) {
        return new AuthUserResponse(user.getId(), user.getName(), user.getEmail(),
                user.getRole().name());
    }
}
