package com.dealflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DealflowApplication {

	public static void main(String[] args) {
		SpringApplication.run(DealflowApplication.class, args);
	}

}
