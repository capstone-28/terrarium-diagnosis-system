idf_component_register(
    SRCS "comms.c"
    INCLUDE_DIRS "include"
    REQUIRES mqtt state_logic
)